import { inject, Injectable } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { environment } from '@app/core/config/environment.config';
import { AuthService } from '@app/core/auth/auth.service';

/**
 * Make Pusher available globally as Laravel Echo expects it.
 */
(window as any).Pusher = Pusher;

@Injectable({
    providedIn: 'root'
})
export class WebsocketService {
    private _authService = inject(AuthService);
    private _echo: Echo<any> | null = null;

    constructor() {
        this._initializeEcho();
    }

    /**
     * Initialize Laravel Echo with Reverb configuration
     */
    private _initializeEcho(): void {
        const token = this._authService.accessToken;

        this._echo = new Echo({
            broadcaster: 'reverb',
            key: environment.reverb.appKey,
            wsHost: environment.reverb.host,
            wsPort: Number(environment.reverb.port),
            wssPort: Number(environment.reverb.port),
            forceTLS: environment.reverb.scheme === 'https',
            enabledTransports: ['ws', 'wss'],
            authEndpoint: `${environment.baseUrl}/broadcasting/auth`,
            auth: {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            },
        });
    }

    /**
     * Returns the Echo instance
     */
    public get echo(): Echo<any> {
        if (!this._echo) {
            this._initializeEcho();
        }
        return this._echo!;
    }

    /**
     * Disconnects the current Echo instance
     */
    public disconnect(): void {
        if (this._echo) {
            this._echo.disconnect();
            this._echo = null;
        }
    }

    /**
     * Re-initializes Echo with the current auth token
     */
    public refreshConnection(): void {
        this.disconnect();
        this._initializeEcho();
    }

    /**
     * Listen to any event on a private channel
     * 
     * @param channelName The name of the private channel
     * @param event The event name (suffix with . for literal match if needed)
     * @param callback Function to handle the received data
     */
    public listenPrivate(channelName: string, event: string, callback: (data: any) => void): void {
        this.echo.private(channelName).listen(event, callback);
    }

    /**
     * Join a private channel
     * 
     * @param channelName The name of the private channel
     */
    public joinPrivate(channelName: string) {
        return this.echo.private(channelName);
    }

    /**
     * Leave a channel
     * 
     * @param channelName The name of the channel to leave
     */
    public leave(channelName: string): void {
        this.echo.leave(channelName);
    }
}
