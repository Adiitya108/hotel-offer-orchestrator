export interface SupplierHotelOffer {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

export interface BestHotelOffer {
  name: string;
  price: number;
  supplier: string;
  commissionPct: number;
}

export interface HotelQueryParams {
  city?: string;
  minPrice?: string | number;
  maxPrice?: string | number;
}
