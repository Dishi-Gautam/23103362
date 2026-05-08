import dotenv from 'dotenv';
import express from 'express';
import { fileURLToPath } from 'node:url';
import maintenanceRoutes from './routes/maintenanceRoutes.js';
import { buildMaintenancePlan } from './controllers/maintenanceController.js';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) });

const app = express();
const port = Number(process.env.PORT || 3000);
const directRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

app.use(express.json());
app.get('/', (req, res) => res.json({ message: 'Vehicle maintenance scheduler is running' }));
app.use('/maintenance', maintenanceRoutes);

if (directRun) {
  app.listen(port, () => {
    console.log(`Vehicle maintenance scheduler listening on port ${port}`);
  });
}

export default app;
export { buildMaintenancePlan };
