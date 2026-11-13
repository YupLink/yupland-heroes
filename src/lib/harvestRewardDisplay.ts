import {groupPendingRewards,type RewardLike} from './rewardGroup';
import {resourceOfKind,rewardShownAmount} from './rewardKinds';
/** Presentation only: old ticket records and both resource encodings share one total. */
export function groupHarvestRewardDisplay<T extends RewardLike>(sources:ReadonlyArray<{rewards:ReadonlyArray<T>}>) {
  return groupPendingRewards(sources.map(source=>({...source,rewards:source.rewards.map(reward=>{
    const resource=resourceOfKind(reward.kind,reward.packId);
    return resource?{...reward,kind:resource,packId:null,name:undefined,image:null,amount:rewardShownAmount(reward.kind,reward.amount)}:reward;
  })})));
}
