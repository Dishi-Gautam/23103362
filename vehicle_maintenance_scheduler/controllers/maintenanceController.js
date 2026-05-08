import { Log } from '../../logging_middleware/index.js';

const API_BASE = process.env.EVALUATION_BASE_URL;

function getHeaders(authHeader) {
  const headers = { 'Content-Type': 'application/json' };
  const token = authHeader || process.env.EVALUATION_TOKEN;
  if (token) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  return headers;
}

async function safeLog(stack, level, packageName, message) {
  try {
    await Log(stack, level, packageName, message);
  } catch {
    
  }
}

async function getJson(path, packageName, authHeader) {
  if (!API_BASE) {
    throw new Error('EVALUATION_BASE_URL is not set in environment');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: getHeaders(authHeader),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    await safeLog('backend', 'error', packageName, `GET ${path} failed with ${response.status}`);
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }

  return data;
}

function mapTasks(items = []) {
  return items
    .map((item) => ({
      taskId: item.TaskID ?? item.taskId ?? item.id,
      duration: Number(item.Duration ?? item.duration ?? 0),
      impact: Number(item.Impact ?? item.impact ?? 0),
    }))
    .filter((task) => task.taskId && Number.isFinite(task.duration) && Number.isFinite(task.impact) && task.duration > 0);
}

function solveKnapsack(tasks, budget) {
  budget = Math.max(0, Math.floor(Number(budget) || 0));
  const dp = Array.from({ length: tasks.length + 1 }, () => Array(budget + 1).fill(0));
  const choose = Array.from({ length: tasks.length + 1 }, () => Array(budget + 1).fill(false));

  for (let index = 1; index <= tasks.length; index += 1) {
    const task = tasks[index - 1];

    for (let cap = 0; cap <= budget; cap += 1) {
      const skip = dp[index - 1][cap];
      const pick = cap >= task.duration ? dp[index - 1][cap - task.duration] + task.impact : -1;

      if (pick > skip) {
        dp[index][cap] = pick;
        choose[index][cap] = true;
      } else {
        dp[index][cap] = skip;
      }
    }
  }

  const selectedTasks = [];
  let cap = budget;

  for (let index = tasks.length; index > 0; index -= 1) {
    if (choose[index][cap]) {
      const task = tasks[index - 1];
      selectedTasks.push(task);
      cap -= task.duration;
    }
  }

  selectedTasks.reverse();

  return {
    selectedTasks,
    totalImpact: dp[tasks.length][budget],
    totalDuration: selectedTasks.reduce((sum, task) => sum + task.duration, 0),
  };
}

export async function buildMaintenancePlan(authHeader) {
  await safeLog('backend', 'info', 'service', 'Starting maintenance planning');

  const [depotsResponse, vehiclesResponse] = await Promise.all([
    getJson('/depots', 'controller', authHeader),
    getJson('/vehicles', 'controller', authHeader),
  ]);

  const depots = Array.isArray(depotsResponse.depots) ? depotsResponse.depots : [];
  const tasks = mapTasks(Array.isArray(vehiclesResponse.vehicles) ? vehiclesResponse.vehicles : []);

  const plan = depots.map((depot) => {
    const mechanicHours = Number(depot.MechanicHours ?? depot.mechanicHours ?? 0);
    const result = solveKnapsack(tasks, mechanicHours);

    return {
      depotId: depot.ID ?? depot.id,
      mechanicHours,
      ...result,
    };
  });

  await safeLog('backend', 'info', 'service', `Built ${plan.length} depot plans`);

  return { depots, vehicles: tasks, plan };
}

export async function getDepots(authHeader) {
  return getJson('/depots', 'controller', authHeader);
}

export async function getMaintenancePlan(_req, res) {
  try {
    const result = await buildMaintenancePlan(_req.headers.authorization);
    res.json(result);
  } catch (error) {
    await safeLog('backend', 'fatal', 'service', error.message || 'Maintenance planner failed');
    res.status(500).json({ message: error.message || 'Unable to build maintenance plan' });
  }
}
