import {
  ChangeDetectionStrategy,
  Component,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-security-tips-panel',
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './security-tips-panel.component.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityTipsPanelComponent {
  // Image source path
  public imageSrc = input<string>('/images/ui/bg-sign-in.png');

  public titleKey = input.required<string>();
  public tip1Key = input.required<string>();
  public tip2Key = input.required<string>();
  public tip3Key = input.required<string>();
}

