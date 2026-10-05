"use client";

/**
 * Loads the Google Maps JavaScript API once per page (browser key: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) and resolves with
 * the map classes the GPS screen uses. Rejects if the script can't load or Google rejects the key (gm_authFailure),
 * so the screen can show a message instead of crashing.
 */
type MapsLibraries = { maps: google.maps.MapsLibrary; marker: google.maps.MarkerLibrary };

const CALLBACK = "__maroonGoogleMapsReady";
let loading: Promise<MapsLibraries> | null = null;
let authFailed: ((error: Error) => void) | null = null;

export function loadGoogleMaps(apiKey: string): Promise<MapsLibraries> {
  if (loading) return loading;
  loading = new Promise<MapsLibraries>((resolve, reject) => {
    const scope = window as unknown as Record<string, unknown>;
    authFailed = (error) => reject(error);
    // Google calls this global when the key is invalid, restricted or missing billing.
    scope.gm_authFailure = () => authFailed?.(new Error("Google Maps rejected the API key."));
    scope[CALLBACK] = async () => {
      try {
        const [maps, marker] = await Promise.all([
          google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
          google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
        ]);
        resolve({ maps, marker });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Google Maps failed to start."));
      }
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${CALLBACK}`;
    script.async = true;
    script.onerror = () => reject(new Error("The Google Maps script couldn't be downloaded."));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null; // let a later visit try again
    throw error;
  });
  return loading;
}

/** Lets a mounted map hear about a key rejection that happens after the script loaded. */
export function onGoogleMapsAuthFailure(listener: (error: Error) => void) {
  authFailed = listener;
}
