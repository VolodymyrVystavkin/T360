import { Component, input } from '@angular/core';
const paths: Record<string, string> = {
  dashboard: 'M3 3H10V10H3Z M14 3H21V14H14Z M3 14H10V21H3Z M14 18H21V21H14Z',
  cad: 'M4 20L20 4 M4 20L8 9L15 16Z M14 4H20V10',
  analysis: 'M4 20V4 M4 20H21 M8 16V11 M13 16V6 M18 16V9',
  cube: 'M12 2L21 7V17L12 22L3 17V7Z M3 7L12 12L21 7 M12 12V22 M8 4L17 9',
  assistant: 'M12 3L14 9L20 11L14 13L12 19L10 13L4 11L10 9Z M19 2V6 M17 4H21',
  settings:
    'M9 3H15L16 6L19 7L21 12L19 17L16 18L15 21H9L8 18L5 17L3 12L5 7L8 6Z M16 12A4 4 0 1 1 8 12A4 4 0 1 1 16 12',
  select: 'M5 3L19 12L12 14L9 21Z',
  pan: 'M8 12V5A1.5 1.5 0 0 1 11 5V10 M11 10V3A1.5 1.5 0 0 1 14 3V10 M14 10V5A1.5 1.5 0 0 1 17 5V12 M17 10A1.5 1.5 0 0 1 20 10V15C20 20 16 22 12 22C8 22 7 19 4 14C3 12 5 11 6 12L8 14Z',
  line: 'M4 20L20 4 M3 17V21H7 M17 3H21V7',
  rectangle: 'M4 5H20V19H4Z M4 5V8 M20 16V19',
  circle: 'M20 12A8 8 0 1 1 4 12A8 8 0 1 1 20 12',
  arc: 'M4 19A11 11 0 0 1 20 5 M4 16V20H8 M17 4H21V8',
  measure: 'M3 15L15 3L21 9L9 21Z M7 11L10 14 M11 7L14 10 M15 3L18 6',
  dimension: 'M4 4V20 M20 4V20 M4 12H20 M7 9L4 12L7 15 M17 9L20 12L17 15',
  diameter: 'M19 12A7 7 0 1 1 5 12A7 7 0 1 1 19 12 M3 21L21 3',
  radius: 'M20 12A8 8 0 1 1 12 4 M12 12L20 4 M15 4H20V9',
  angular: 'M21 20H3L16 4 M10 20A7 7 0 0 0 7 14',
  layers: 'M12 3L22 8L12 13L2 8Z M3 12L12 17L21 12 M3 16L12 21L21 16',
  eye: 'M2 12S6 5 12 5S22 12 22 12S18 19 12 19S2 12 2 12 M15 12A3 3 0 1 1 9 12A3 3 0 1 1 15 12',
  hidden: 'M3 3L21 21 M9 5A12 12 0 0 1 22 12L18 17 M6 6L2 12S6 19 12 19L16 18',
  left: 'M15 5L8 12L15 19',
  right: 'M9 5L16 12L9 19',
  undo: 'M8 5L3 10L8 15 M3 10H15A6 6 0 0 1 15 22',
  redo: 'M16 5L21 10L16 15 M21 10H9A6 6 0 0 0 9 22',
  fit: 'M3 8V3H8 M16 3H21V8 M21 16V21H16 M8 21H3V16 M8 8H16V16H8Z',
  plus: 'M12 5V19 M5 12H19',
  minus: 'M5 12H19',
  import: 'M12 3V15 M7 10L12 15L17 10 M4 16V21H20V16',
  export: 'M12 16V3 M7 8L12 3L17 8 M4 16V21H20V16',
  save: 'M4 3H17L21 7V21H3V3Z M7 3V9H16V3 M7 21V14H17V21',
  check: 'M4 12L9 17L20 6',
  close: 'M5 5L19 19 M5 19L19 5',
  info: 'M20 12A8 8 0 1 1 4 12A8 8 0 1 1 20 12 M12 11V16 M12 7V8',
};
@Component({
  selector: 'ui-icon',
  template:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path [attr.d]="path()" /></svg>',
  styles:
    ':host{display:inline-flex;width:20px;height:20px;flex-shrink:0;vertical-align:middle}svg{width:100%;height:100%}',
})
export class UiIcon {
  name = input('info');
  path() {
    return paths[this.name()] || paths['info'];
  }
}
