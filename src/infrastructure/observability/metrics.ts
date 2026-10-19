import client from 'prom-client';

// Enable default metrics (memory, event loop, CPU, garbage collection)
client.collectDefaultMetrics({ prefix: 'amrutam_' });

export const httpRequestDurationHistogram = new client.Histogram({
  name: 'amrutam_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});

export const consultationBookingsCounter = new client.Counter({
  name: 'amrutam_consultation_bookings_total',
  help: 'Total number of consultation bookings created',
  labelNames: ['status'],
});

export const prescriptionsIssuedCounter = new client.Counter({
  name: 'amrutam_prescriptions_issued_total',
  help: 'Total number of prescriptions issued',
});

export const paymentTransactionsCounter = new client.Counter({
  name: 'amrutam_payment_transactions_total',
  help: 'Total payment transactions processed',
  labelNames: ['status', 'provider'],
});

export const activeSlotsGauge = new client.Gauge({
  name: 'amrutam_active_availability_slots',
  help: 'Current number of available slots',
});

export const prometheusRegistry = client.register;
