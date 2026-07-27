import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@app/core/config/environment.config';
import { DigestPackagePreview, DigestPackageSendResult } from '@app/core/models/digest-package/digest-package.model';

@Injectable({
  providedIn: 'root',
})
export class DigestPackageService {
  private _http = inject(HttpClient);

  private get _base(): string {
    return `${environment.apiBaseUrl}/digest-packages`;
  }

  /** GET /api/admin/digest-packages/preview — solo lectura, no envía nada */
  preview(): Observable<DigestPackagePreview> {
    return this._http.get<DigestPackagePreview>(`${this._base}/preview`);
  }

  /** POST /api/admin/digest-packages/send — encola un consolidado por org */
  send(): Observable<DigestPackageSendResult> {
    return this._http.post<DigestPackageSendResult>(`${this._base}/send`, null);
  }
}
