// Local contract fixture for the single-VIN batch call. Never deployed.
const http = require('node:http');
http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url.replace(/\/$/, '') !== '/api/vehicles/DecodeVINValuesBatch') { res.writeHead(501); return res.end('Not modelled'); }
  let raw = typeof req.body === 'string' ? req.body : req.body ? new URLSearchParams(req.body).toString() : '';
  if (!raw) for await (const chunk of req) raw += chunk;
  const form = new URLSearchParams(raw);
  if (!String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded') || form.get('format') !== 'json' || !/^[A-HJ-NPR-Z0-9]{17}(?:,\d{4})?$/.test(form.get('data') || '')) { res.writeHead(400); return res.end('Invalid form'); }
  const scenario = req.headers['x-test-scenario'];
  if (scenario === 'slow') await new Promise(resolve => setTimeout(resolve, 9000));
  if (scenario === 'unavailable') { res.writeHead(503, {'Content-Type':'text/html'}); return res.end('<h1>Unavailable</h1>'); }
  if (scenario === 'rate-limit') { res.writeHead(429, {'Retry-After':'60'}); return res.end('Busy'); }
  res.writeHead(200, {'Content-Type':'application/json'});
  res.end(JSON.stringify({Count: 1, Results: [{VIN: form.get('data').split(',')[0], ErrorCode: '0', ModelYear: '2003', Make: 'HONDA', Model: 'Accord', Trim: 'EX-V6', BodyClass: 'Coupe', TransmissionStyle: 'Automatic', FuelTypePrimary: 'Gasoline', DisplacementL: '2.998832712', EngineCylinders: '6', PlantCountry: 'UNITED STATES (USA)', Doors: '2'}]}));
}).listen(process.env.PORT || 4500);
