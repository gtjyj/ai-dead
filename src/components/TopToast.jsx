export default function TopToast({ flash }) {
  if (!flash?.message) {
    return null;
  }

  return <div className={`top-toast ${flash.tone}`}>{flash.message}</div>;
}
