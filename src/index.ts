import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { supplierAHotels, supplierBHotels } from './mockData/hotels';
import { getTemporalClient, TASK_QUEUE_NAME } from './temporal/client';
import { hotelOfferWorkflow } from './temporal/workflows';
import { getHotelsFromRedis } from './services/redisService';
import { BestHotelOffer } from './types/hotel';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Flag to simulate supplier outage (for testing bonus point / resilience)
let supplierADown = false;
let supplierBDown = false;

// Admin toggle endpoint to simulate supplier failure for Postman/testing
app.post('/admin/simulate-failure', (req: Request, res: Response) => {
  const { supplierA, supplierB } = req.body;
  if (typeof supplierA === 'boolean') supplierADown = supplierA;
  if (typeof supplierB === 'boolean') supplierBDown = supplierB;
  res.json({ message: 'Supplier simulation status updated', supplierADown, supplierBDown });
});

// Mock Supplier A Endpoint
app.get('/supplierA/hotels', (req: Request, res: Response) => {
  if (supplierADown) {
    return res.status(503).json({ error: 'Supplier A is currently unavailable' });
  }

  const city = (req.query.city as string)?.trim().toLowerCase();
  if (city) {
    const filtered = supplierAHotels.filter((h) => h.city.toLowerCase() === city);
    return res.json(filtered);
  }
  return res.json(supplierAHotels);
});

// Mock Supplier B Endpoint
app.get('/supplierB/hotels', (req: Request, res: Response) => {
  if (supplierBDown) {
    return res.status(503).json({ error: 'Supplier B is currently unavailable' });
  }

  const city = (req.query.city as string)?.trim().toLowerCase();
  if (city) {
    const filtered = supplierBHotels.filter((h) => h.city.toLowerCase() === city);
    return res.json(filtered);
  }
  return res.json(supplierBHotels);
});

// Health check endpoint (Bonus requirement)
app.get('/health', (req: Request, res: Response) => {
  const healthStatus = {
    status: !supplierADown && !supplierBDown ? 'UP' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    suppliers: {
      supplierA: supplierADown ? 'DOWN' : 'UP',
      supplierB: supplierBDown ? 'DOWN' : 'UP',
    },
  };

  const statusCode = !supplierADown && !supplierBDown ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

/**
 * Main Aggregator Endpoint:
 * GET /api/hotels?city=delhi
 * GET /api/hotels?city=delhi&minPrice=<min>&maxPrice=<max>
 */
app.get('/api/hotels', async (req: Request, res: Response) => {
  const city = req.query.city as string;
  const minPriceStr = req.query.minPrice as string;
  const maxPriceStr = req.query.maxPrice as string;

  if (!city) {
    return res.status(400).json({ error: "Missing required query parameter: 'city'" });
  }

  const minPrice = minPriceStr !== undefined ? parseFloat(minPriceStr) : undefined;
  const maxPrice = maxPriceStr !== undefined ? parseFloat(maxPriceStr) : undefined;

  try {
    // 1. If minPrice or maxPrice are provided, check Redis first for fast filtered retrieval
    if (minPrice !== undefined || maxPrice !== undefined) {
      const cached = await getHotelsFromRedis(city, minPrice, maxPrice);
      if (cached !== null) {
        return res.json(cached);
      }
    }

    // 2. Trigger Temporal workflow to orchestrate parallel fetching, deduplicating, and storing to Redis
    const client = await getTemporalClient();
    const workflowId = `hotel-workflow-${city.trim().toLowerCase()}-${Date.now()}`;

    const handle = await client.workflow.start(hotelOfferWorkflow, {
      args: [city],
      taskQueue: TASK_QUEUE_NAME,
      workflowId,
    });

    const result: BestHotelOffer[] = await handle.result();

    // 3. If price filters were provided, retrieve filtered from Redis (as required: "Implement price filtering inside Redis")
    if (minPrice !== undefined || maxPrice !== undefined) {
      const filteredResults = await getHotelsFromRedis(city, minPrice, maxPrice);
      return res.json(filteredResults || []);
    }

    return res.json(result);
  } catch (error: any) {
    console.error('[API] Error processing hotel search:', error.message);
    return res.status(500).json({
      error: 'Failed to retrieve hotel offers',
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Hotel Offer Orchestrator running on port ${PORT}`);
});

export default app;
