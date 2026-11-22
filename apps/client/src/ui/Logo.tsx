/** The game's logo (the arena badge, public/icon.svg) with the name beside it. */
export function Logo({ size = 64 }: { size?: number }) {
  return (
    <div className="logo" data-testid="logo">
      <img src={`${import.meta.env.BASE_URL}icon.svg`} width={size} height={size} alt="" />
      <span className="logo-name">
        Odense
        <br />
        Monster League
      </span>
    </div>
  );
}
