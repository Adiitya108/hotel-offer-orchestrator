import Redis from 'ioredis';
import { BestHotelOffer } from '../types/hotel';

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisInstance) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisInstance = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
    });

    redisInstance.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });

    redisInstance.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });
  }
  return redisInstance;
}

/**
 * Stores deduplicated hotels for a city into Redis.
 * We store:
 * 1. A JSON hash map: hotels:data:<city> mapping hotelName -> JSON string
 * 2. A Sorted Set for fast range queries by price: hotels:zset:<city> with score = price, member = hotelName
 * 3. TTL (e.g. 10 minutes) to keep data fresh and manageable
 */
export async function saveHotelsToRedis(city: string, hotels: BestHotelOffer[], ttlSeconds: number = 600): Promise<void> {
  const redis = getRedisClient();
  const normalizedCity = city.trim().toLowerCase();
  const zsetKey = `hotels:zset:${normalizedCity}`;
  const dataKey = `hotels:data:${normalizedCity}`;

  const pipeline = redis.pipeline();

  // Clear existing entries for fresh run
  pipeline.del(zsetKey);
  pipeline.del(dataKey);

  if (hotels.length > 0) {
    const dataHash: Record<string, string> = {};
    for (const h of hotels) {
      pipeline.zadd(zsetKey, h.price, h.name);
      dataHash[h.name] = JSON.stringify(h);
    }
    pipeline.hset(dataKey, dataHash);
    pipeline.expire(zsetKey, ttlSeconds);
    pipeline.expire(dataKey, ttlSeconds);
  }

  await pipeline.exec();
}

/**
 * Filter hotels directly inside Redis using ZRANGEBYSCORE and HGET
 */
export async function getHotelsFromRedis(
  city: string,
  minPrice?: number,
  maxPrice?: number
): Promise<BestHotelOffer[] | null> {
  const redis = getRedisClient();
  const normalizedCity = city.trim().toLowerCase();
  const zsetKey = `hotels:zset:${normalizedCity}`;
  const dataKey = `hotels:data:${normalizedCity}`;

  const exists = await redis.exists(zsetKey);
  if (!exists) {
    return null; // Cache miss or city not loaded yet
  }

  const min = minPrice !== undefined && !isNaN(minPrice) ? minPrice : '-inf';
  const max = maxPrice !== undefined && !isNaN(maxPrice) ? maxPrice : '+inf';

  // Get matching hotel names sorted by price
  const hotelNames = await redis.zrangebyscore(zsetKey, min, max);

  if (!hotelNames || hotelNames.length === 0) {
    return [];
  }

  const hotelJsonList = await redis.hmget(dataKey, ...hotelNames);

  const results: BestHotelOffer[] = [];
  for (const item of hotelJsonList) {
    if (item) {
      results.push(JSON.parse(item));
    }
  }

  return results;
}
