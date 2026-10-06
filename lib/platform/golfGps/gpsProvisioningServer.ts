import "server-only";
import { createGpsProvisioner, type GpsProvisioner } from "./gpsProvisioning";
import { getCourseLibrary } from "./repository/courseLibrary";

let provisioner: GpsProvisioner | null = null;

/** One provisioner per server instance, so simultaneous "Prepare GPS" taps for the same course share a single run. */
export function getGpsProvisioner(): GpsProvisioner {
  provisioner ??= createGpsProvisioner({ repository: getCourseLibrary() });
  return provisioner;
}
