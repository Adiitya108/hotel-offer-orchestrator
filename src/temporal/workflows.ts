import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
import { BestHotelOffer } from '../types/hotel';

const {
  fetchSupplierAOffers,
  fetchSupplierBOffers,
  deduplicateAndSelectBestOffers,
  cacheDeduplicatedOffersInRedis,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  retry: {
    initialInterval: '1 second',
    maximumInterval: '10 seconds',
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

/**
 * Hotel Offer Aggregation Workflow
 * 1. Calls Supplier A and Supplier B in parallel
 * 2. Deduplicates hotels by name and picks the cheapest offer
 * 3. Saves the deduplicated list into Redis (with price indexing for queries)
 * 4. Returns the final deduplicated list
 */
export async function hotelOfferWorkflow(city: string): Promise<BestHotelOffer[]> {
  // Call Supplier A and Supplier B in parallel
  const [offersA, offersB] = await Promise.all([
    fetchSupplierAOffers(city),
    fetchSupplierBOffers(city),
  ]);

  // Deduplicate and choose the best offer per hotel
  const bestOffers = await deduplicateAndSelectBestOffers(offersA, offersB);

  // Cache in Redis for price-filtering queries
  await cacheDeduplicatedOffersInRedis(city, bestOffers);

  return bestOffers;
}
