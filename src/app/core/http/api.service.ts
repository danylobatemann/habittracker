import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface RequestOptions {
  params?: HttpParams | Record<string, string | number | boolean>;
  context?: HttpContext;
  headers?: Record<string, string>;
}

/**
 * Thin typed wrapper around HttpClient: prefixes the API base URL and keeps
 * endpoint services free of URL plumbing. Auth, errors and clock sync are
 * handled by interceptors, not here.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  readonly baseUrl = environment.apiUrl;

  get<T>(path: string, options: RequestOptions = {}): Observable<T> {
    return this.http.get<T>(this.url(path), options);
  }

  post<T>(path: string, body: unknown = null, options: RequestOptions = {}): Observable<T> {
    return this.http.post<T>(this.url(path), body, options);
  }

  put<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
    return this.http.put<T>(this.url(path), body, options);
  }

  patch<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
    return this.http.patch<T>(this.url(path), body, options);
  }

  delete<T = void>(path: string, options: RequestOptions = {}): Observable<T> {
    return this.http.delete<T>(this.url(path), options);
  }

  isApiUrl(url: string): boolean {
    return url.startsWith(this.baseUrl);
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
  }
}
