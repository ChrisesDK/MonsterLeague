/** The game's logo (the arena badge, public/icon.svg) with its name (`ui.title`) beside it. */
export function Logo({ name, size = 64 }: { name: string; size?: number }) {
  return (
    <div className="logo" data-testid="logo">
      <img src={`${import.meta.env.BASE_URL}icon.svg`} width={size} height={size} alt="" />
      <span className="logo-name">{name}</span>
    </div>
  );
}
