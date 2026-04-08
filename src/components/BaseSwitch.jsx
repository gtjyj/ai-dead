export default function BaseSwitch({ checked, disabled = false, label, onChange, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title || label}
      disabled={disabled}
      className={`base-switch${checked ? " checked" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="base-switch-track">
        <span className="base-switch-thumb" />
      </span>
    </button>
  );
}
