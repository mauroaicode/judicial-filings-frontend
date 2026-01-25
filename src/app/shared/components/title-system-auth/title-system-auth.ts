import { Component } from '@angular/core';
import {environment} from '@app/core/config/environment.config';

@Component({
  selector: 'app-title-system-auth',
  templateUrl: './title-system-auth.html',
})
export class TitleSystemAuth {
  public systemName = environment.systemName;
}
