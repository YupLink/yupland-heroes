// YupLink logo: PNG из /public/yuplink-logo.png (котик в очках).

export function YupLinkLogo(props: { className?: string; title?: string }) {
  return (
    <img
      src="/yuplink-logo.webp"
      alt={props.title ?? "YupLink"}
      className={props.className}
    />
  );
}
