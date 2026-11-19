import axios from 'axios';
import { SupplierHotelOffer, BestHotelOffer } from '../types/hotel';
import { saveHotelsToRedis } from '../services/redisService';

const APP_PORT = process.env.PORT || '3000';
const BASE_URL = process.env.INTERNAL_API_URL || `http://localhost:${APP_PORT}`;

export async function fetchSupplierAOffers(city: string): Promise<SupplierHotelOffer[]> {
  try {
    const url = `${BASE_URL}/supplierA/hotels?city=${encodeURIComponent(city)}`;
    const response = await axios.get<SupplierHotelOffer[]>(url, { timeout: 5000 });
    return response.data || [];
  } catch (error: any) {
    console.error(`[Activity] fetchSupplierAOffers failed: ${error.message}`);
    throw error;
  }
}

export async function fetchSupplierBOffers(city: string): Promise<SupplierHotelOffer[]> {
  try {
    const url = `${BASE_URL}/supplierB/hotels?city=${encodeURIComponent(city)}`;
    const response = await axios.get<SupplierHotelOffer[]>(url, { timeout: 5000 });
    return response.data || [];
  } catch (error: any) {
    console.error(`[Activity] fetchSupplierBOffers failed: ${error.message}`);
    throw error;
  }
}

export async function deduplicateAndSelectBestOffers(
  offersA: SupplierHotelOffer[],
  offersB: SupplierHotelOffer[]
): Promise<BestHotelOffer[]> {
  const hotelMap = new Map<string, BestHotelOffer>();

  // Process Supplier A
  for (const offer of offersA) {
    hotelMap.set(offer.name.trim().toLowerCase(), {
      name: offer.name,
      price: offer.price,
      supplier: 'Supplier A',
      commissionPct: offer.commissionPct,
    });
  }

  // Process Supplier B and deduplicate/select best price
  for (const offer of offersB) {
    const key = offer.name.trim().toLowerCase();
    const existing = hotelMap.get(key);

    if (!existing) {
      hotelMap.set(key, {
        name: offer.name,
        price: offer.price,
        supplier: 'Supplier B',
        commissionPct: offer.commissionPct,
      });
    } else {
      // Both suppliers have this hotel: select the one with cheaper price
      if (offer.price < existing.price) {
        hotelMap.set(key, {
          name: offer.name,
          price: offer.price,
          supplier: 'Supplier B',
          commissionPct: offer.commissionPct,
        });
      }
    }
  }

  return Array.from(hotelMap.values());
}

export async function cacheDeduplicatedOffersInRedis(city: string, hotels: BestHotelOffer[]): Promise<void> {
  try {
    await saveHotelsToRedis(city, hotels);
    console.log(`[Activity] Successfully cached ${hotels.length} hotels in Redis for city: ${city}`);
  } catch (error: any) {
    console.error(`[Activity] Failed to cache hotels in Redis for city ${city}: ${error.message}`);
    // Non-fatal or rethrow depending on policy, but requirement states "Deduplicated list must also be saved in Redis"
    throw error;
  }
}
