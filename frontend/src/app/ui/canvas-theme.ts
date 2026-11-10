/** Presentation tokens only: these values are never written to a drawing. */
export function cadTheme() {
  const css = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const token = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback;
  return {
    background: token('--cad-bg', '#18232d'),
    grid: token('--cad-grid', '#263744'),
    geometry: token('--cad-geometry', '#64d8cf'),
    selected: token('--cad-selected', '#a78bfa'),
    dimension: token('--cad-dimension', '#f4c16e'),
    warning: token('--cad-warning', '#ff9aa4'),
    axisX: token('--cad-axis-x', '#396f69'),
    axisY: token('--cad-axis-y', '#6a597f'),
  };
}
