import { Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CadDraftService } from '../cad-draft.service';
import { UiPreferences } from './preferences';
import { UiIcon } from './icon';
import { UiState } from './state';
@Component({
  selector: 'workspace-pages',
  imports: [UiIcon, UiState, FormsModule],
  templateUrl: './workspace-pages.html',
  styleUrl: './workspace-pages.scss',
})
export class WorkspacePages {
  cad = inject(CadDraftService);
  preferences = inject(UiPreferences);
  navigate = output<string>();
  cadAnalysis = output<void>();
}
