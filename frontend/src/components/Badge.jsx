export function Badge({ status, text }) {
  const normalized = (status || '').toLowerCase().replace(/[\s_-]+/g, '');

  let badgeClass = 'badge-secondary';
  let label = text || status;

  if (normalized === 'instock' || normalized === 'valid') {
    badgeClass = 'badge-success';
  } else if (normalized === 'outofstock' || normalized === 'expired') {
    badgeClass = 'badge-danger';
  } else if (normalized === 'expiringsoon') {
    badgeClass = 'badge-warning';
  }

  return <span className={`badge ${badgeClass}`}>{label}</span>;
}
