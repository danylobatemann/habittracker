export interface AppEnvironment {
  production: boolean;
  /** REST base URL, no trailing slash */
  apiUrl: string;
  /** WebSocket endpoint for realtime room updates. Relative paths resolve against the current host. */
  wsUrl: string;
  /** Serve every API call and realtime event from the in-browser mock backend */
  useMockApi: boolean;
  /** Public origin used in invite links. Empty = current `location.origin`. */
  appUrl: string;
}
