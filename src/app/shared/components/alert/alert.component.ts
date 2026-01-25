import {
  ChangeDetectionStrategy,
  Component,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

export type AlertType = 'error' | 'success' | 'warning';

@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertComponent {

  public type = input<AlertType>('error');

  public message = input.required<string>();

  public useTranslation = input<boolean>(true);
}

