/** Shown in place of a page when its data cannot load, naming the fix. */
export function SetupNotice({ message }: { message: string }) {
  return (
    <section className="panel notice" role="alert">
      <h2>Vault is not ready yet</h2>
      <p>
        {/* Setup messages quote commands in `backticks`; show those as code. */}
        {message.split("`").map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part))}
      </p>
      <p className="muted">See the README for local setup steps.</p>
    </section>
  );
}
