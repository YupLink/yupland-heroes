"""Run only against an empty, disposable PostgreSQL database supplied by CI."""
import concurrent.futures
import itertools
import os
from pathlib import Path
import subprocess
import threading

assert os.environ.get('SLOT_ISOLATED_TEST_DB') == '1', 'Explicit isolated-test opt-in required'
assert os.environ.get('PGHOST') in ('localhost', '127.0.0.1'), 'Local isolated database only'
ROOT = Path(__file__).resolve().parents[1]

def run(sql, check=True):
    result = subprocess.run(['psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], text=True, capture_output=True)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result

def value(sql):
    return run(sql).stdout.strip()

assert value("SELECT count(*) FROM pg_namespace WHERE nspname='yuplink'") == '0', 'Database must be empty'
run((ROOT / 'tests/slot-fixture.sql').read_text())
run((ROOT / 'tests/townhall-original.sql').read_text())
migration = (ROOT / 'migrations/townhall-02-atomic-legacy-purchases.sql').read_text()
run(migration)
run(migration)
cost = "'{\"gold\":100}'::jsonb"

def purchase(kind, account):
    if kind == 'catalogue':
        return f"SELECT * FROM yuplink.castle_building_buy('{account}','throne',{cost},1,1,ARRAY[8,15,22,29,36,43,50,57,64],0,'catalogue:{account}')"
    if kind == 'casino':
        return f"SELECT * FROM yuplink.castle_casino_build('{account}',{cost},'casino:{account}')"
    fn = 'castle_architect_upgrade' if kind == 'architect' else 'castle_auction_house_upgrade'
    return f"SELECT * FROM yuplink.{fn}('{account}',0,{cost},'{kind}:{account}')"

def seeded(account):
    run(f"INSERT INTO yuplink.castle_building(account_id,kind) SELECT '{account}','fixture-'||i FROM generate_series(1,7) i")

cases = 0
for a, b in itertools.combinations(['catalogue', 'casino', 'architect', 'auction'], 2):
    for attempt in range(4):
        account = f'{a}_{b}_{attempt}'
        seeded(account)
        gate = threading.Barrier(2)
        def worker(kind):
            gate.wait()
            return run("BEGIN; SET LOCAL lock_timeout='10s'; " + purchase(kind, account) + '; SELECT pg_sleep(0.2); COMMIT;', False)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            jobs = [pool.submit(worker, kind) for kind in [a,b]]
            results = [job.result(timeout=20) for job in jobs]
        assert sorted(r.returncode == 0 for r in results) == [False, True], [r.stderr for r in results]
        assert 'townhall_no_slot:8:8' in next(r.stderr for r in results if r.returncode), [r.stderr for r in results]
        assert value(f"SELECT yuplink.castle_slots_used('{account}')") == '8'
        assert value(f"SELECT count(*) FROM yuplink.test_payments WHERE account_id='{account}'") == '1'
        winner = [a,b][next(i for i,r in enumerate(results) if r.returncode == 0)]
        assert value(purchase(winner, account)).endswith('|f'), 'Replay must be idempotent at full capacity'
        assert value(f"SELECT count(*) FROM yuplink.test_payments WHERE account_id='{account}'") == '1'
        cases += 1

for kind,fn in [('architect','castle_architect_upgrade'),('auction','castle_auction_house_upgrade')]:
    account = 'upgrade_' + kind
    seeded(account)
    run(purchase(kind, account))
    assert value(f"SELECT * FROM yuplink.{fn}('{account}',1,{cost},'upgrade:{account}')") == '2|t'
    assert value(f"SELECT yuplink.castle_slots_used('{account}')") == '8'
    cases += 1
print(f'PASS: {cases} cases, including 24 races with two PostgreSQL sessions; migration applied twice')
