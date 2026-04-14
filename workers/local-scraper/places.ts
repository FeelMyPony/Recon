/**
 * Deprecated. This module used Google Places API directly and was replaced
 * by outscraper.ts because Outscraper is ~30x cheaper at typical RECON usage
 * volumes. Kept as an empty re-export so any stale import paths break loudly
 * rather than silently regressing to the expensive backend.
 *
 * @deprecated Use `./outscraper.ts` instead.
 */

export {};
