import { deduplicateAndSelectBestOffers } from './temporal/activities';
import { SupplierHotelOffer } from './types/hotel';

describe('Hotel Deduplication and Best Offer Selection', () => {
  it('should select cheaper price when hotel appears in both suppliers', async () => {
    const supplierA: SupplierHotelOffer[] = [
      { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
      { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
    ];

    const supplierB: SupplierHotelOffer[] = [
      { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
      { hotelId: 'b2', name: 'Radison', price: 6150, city: 'delhi', commissionPct: 15 },
    ];

    const results = await deduplicateAndSelectBestOffers(supplierA, supplierB);

    expect(results).toHaveLength(2);

    const holtin = results.find((h) => h.name === 'Holtin');
    expect(holtin).toBeDefined();
    expect(holtin?.price).toBe(5340);
    expect(holtin?.supplier).toBe('Supplier B');
    expect(holtin?.commissionPct).toBe(20);

    const radison = results.find((h) => h.name === 'Radison');
    expect(radison).toBeDefined();
    expect(radison?.price).toBe(5900);
    expect(radison?.supplier).toBe('Supplier A');
    expect(radison?.commissionPct).toBe(13);
  });

  it('should include hotels that appear in only one supplier', async () => {
    const supplierA: SupplierHotelOffer[] = [
      { hotelId: 'a1', name: 'Taj Palace', price: 11000, city: 'delhi', commissionPct: 12 },
    ];

    const supplierB: SupplierHotelOffer[] = [
      { hotelId: 'b1', name: 'Oberoi', price: 9500, city: 'delhi', commissionPct: 14 },
    ];

    const results = await deduplicateAndSelectBestOffers(supplierA, supplierB);

    expect(results).toHaveLength(2);
    expect(results.some((h) => h.name === 'Taj Palace' && h.supplier === 'Supplier A')).toBe(true);
    expect(results.some((h) => h.name === 'Oberoi' && h.supplier === 'Supplier B')).toBe(true);
  });

  it('should return empty list if both suppliers return empty', async () => {
    const results = await deduplicateAndSelectBestOffers([], []);
    expect(results).toEqual([]);
  });
});
