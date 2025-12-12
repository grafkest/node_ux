import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import rateLimit from 'express-rate-limit';
import { createAuthMiddleware } from '../common/authMiddleware.js';
import { createMemoryCache, getOrSet } from '../common/cache.js';
import { createKnexClient } from '../common/knexClient.js';

const port = Number.parseInt(process.env.PORT ?? '4003', 10);
const knexClient = createKnexClient('workforce');
const authMiddleware = createAuthMiddleware();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false
});
const directoryCache = createMemoryCache({ ttlMs: 90 * 1000 });
const metricsCache = createMemoryCache({ ttlMs: 60 * 1000 });
const app = express();

app.use(cors());
app.use(limiter);
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await knexClient.raw('select 1');
    res.json({ status: 'ok', service: 'workforce' });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      service: 'workforce',
      message: error instanceof Error ? error.message : 'Health check failed'
    });
  }
});

app.use(authMiddleware.protect());

app.get('/employees', async (_req, res) => {
  try {
    const payload = await getOrSet(directoryCache, 'employees:list', async () => {
      const employees = await knexClient('employees')
        .select(
          'id',
          'full_name as fullName',
          'position',
          'email',
          'location',
          'created_at as createdAt',
          'updated_at as updatedAt'
        )
        .orderBy('created_at', 'asc');

      const [skills, availability] = await Promise.all([
        loadSkillsForEmployees(employees.map((employee) => employee.id)),
        loadAvailabilityByEmployee(employees.map((employee) => employee.id))
      ]);

      return employees.map((employee) => ({
        ...employee,
        skills: skills.get(employee.id) ?? [],
        availability: availability.get(employee.id) ?? []
      }));
    });

    res.json(payload);
  } catch (error) {
    console.error('Failed to list employees', error);
    res.status(500).json({ message: 'Не удалось получить список сотрудников.' });
  }
});

app.post('/employees', async (req, res) => {
  const { fullName, position, email, location, availability } = req.body ?? {};

  if (!fullName || typeof fullName !== 'string') {
    res.status(400).json({ message: 'Поле fullName обязательно.' });
    return;
  }

  if (!position || typeof position !== 'string') {
    res.status(400).json({ message: 'Поле position обязательно.' });
    return;
  }

  try {
    const employeeId = randomUUID();
    const [created] = await knexClient('employees')
      .insert({
        id: employeeId,
        full_name: fullName,
        position,
        email,
        location,
        updated_at: knexClient.fn.now()
      })
      .returning([
        'id',
        'full_name as fullName',
        'position',
        'email',
        'location',
        'created_at as createdAt',
        'updated_at as updatedAt'
      ]);

    await replaceAvailability(employeeId, availability);

    const employeeAvailability = await loadAvailabilityByEmployee([employeeId]);

    directoryCache.clear();
    metricsCache.clear();
    res.status(201).json({
      ...created,
      skills: [],
      availability: employeeAvailability.get(employeeId) ?? []
    });
  } catch (error) {
    console.error('Failed to create employee', error);
    res.status(500).json({ message: 'Не удалось создать сотрудника.' });
  }
});

app.get('/employees/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const employee = await knexClient('employees')
      .select(
        'id',
        'full_name as fullName',
        'position',
        'email',
        'location',
        'created_at as createdAt',
        'updated_at as updatedAt'
      )
      .where({ id })
      .first();

    if (!employee) {
      res.status(404).json({ message: 'Сотрудник не найден.' });
      return;
    }

    const [skills, availability] = await Promise.all([
      loadSkillsForEmployees([employee.id]),
      loadAvailabilityByEmployee([employee.id])
    ]);

    res.json({
      ...employee,
      skills: skills.get(employee.id) ?? [],
      availability: availability.get(employee.id) ?? []
    });
  } catch (error) {
    console.error('Failed to load employee', error);
    res.status(500).json({ message: 'Не удалось получить сотрудника.' });
  }
});

app.put('/employees/:id', async (req, res) => {
  const { id } = req.params;
  const { fullName, position, email, location, availability } = req.body ?? {};

  try {
    const existing = await knexClient('employees').where({ id }).first();

    if (!existing) {
      res.status(404).json({ message: 'Сотрудник не найден.' });
      return;
    }

    await knexClient('employees')
      .where({ id })
      .update({
        full_name: typeof fullName === 'string' ? fullName : existing.full_name,
        position: typeof position === 'string' ? position : existing.position,
        email: typeof email === 'string' || email === null ? email : existing.email,
        location: typeof location === 'string' || location === null ? location : existing.location,
        updated_at: knexClient.fn.now()
      });

    if (Array.isArray(availability)) {
      await replaceAvailability(id, availability);
    }

    const [employee, skills, availabilityByEmployee] = await Promise.all([
      knexClient('employees')
        .select(
          'id',
          'full_name as fullName',
          'position',
          'email',
          'location',
          'created_at as createdAt',
          'updated_at as updatedAt'
        )
        .where({ id })
        .first(),
      loadSkillsForEmployees([id]),
      loadAvailabilityByEmployee([id])
    ]);

    if (!employee) {
      res.status(404).json({ message: 'Сотрудник не найден после обновления.' });
      return;
    }

    directoryCache.clear();
    metricsCache.clear();
    res.json({
      ...employee,
      skills: skills.get(id) ?? [],
      availability: availabilityByEmployee.get(id) ?? []
    });
  } catch (error) {
    console.error('Failed to update employee', error);
    res.status(500).json({ message: 'Не удалось обновить данные сотрудника.' });
  }
});

app.delete('/employees/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await knexClient('employees').where({ id }).del();

    if (!deleted) {
      res.status(404).json({ message: 'Сотрудник не найден.' });
      return;
    }

    directoryCache.clear();
    metricsCache.clear();
    res.status(204).end();
  } catch (error) {
    console.error('Failed to delete employee', error);
    res.status(500).json({ message: 'Не удалось удалить сотрудника.' });
  }
});

app.get('/employees/:id/skills', async (req, res) => {
  const { id } = req.params;

  try {
    const employee = await knexClient('employees').where({ id }).first();
    if (!employee) {
      res.status(404).json({ message: 'Сотрудник не найден.' });
      return;
    }

    const skills = await loadSkillsForEmployees([id]);
    res.json(skills.get(id) ?? []);
  } catch (error) {
    console.error('Failed to load employee skills', error);
    res.status(500).json({ message: 'Не удалось получить навыки сотрудника.' });
  }
});

app.put('/employees/:id/skills', async (req, res) => {
  const { id } = req.params;
  const { skills } = req.body ?? {};

  if (!Array.isArray(skills)) {
    res.status(400).json({ message: 'Поле skills должно быть массивом.' });
    return;
  }

  try {
    const employee = await knexClient('employees').where({ id }).first();
    if (!employee) {
      res.status(404).json({ message: 'Сотрудник не найден.' });
      return;
    }

    await knexClient.transaction(async (trx) => {
      await trx('employee_skills').where({ employee_id: id }).del();

      const skillRows = await Promise.all(
        skills.map(async (skill) => {
          if (!skill || typeof skill.name !== 'string' || !skill.name.trim()) {
            throw new Error('Каждый навык должен содержать непустое поле name.');
          }

          const trimmedName = skill.name.trim();
          let skillRow = await trx('skills').where({ name: trimmedName }).first();

          if (!skillRow) {
            const [inserted] = await trx('skills')
              .insert({ name: trimmedName, category: skill.category, description: skill.description })
              .returning(['id', 'name', 'category', 'description']);
            skillRow = inserted;
          }

          await trx('employee_skills').insert({
            employee_id: id,
            skill_id: skillRow.id,
            proficiency: skill.proficiency
          });

          return {
            id: skillRow.id,
            name: skillRow.name,
            category: skillRow.category,
            description: skillRow.description,
            proficiency: skill.proficiency ?? null
          };
        })
      );

      res.json(skillRows);
    });
    directoryCache.clear();
    metricsCache.clear();
  } catch (error) {
    console.error('Failed to update employee skills', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Не удалось обновить навыки.' });
  }
});

app.get('/assignments', async (req, res) => {
  const { initiativeId } = req.query;

  try {
    const cacheKey = `assignments:${initiativeId ?? 'all'}`;
    const rows = await getOrSet(metricsCache, cacheKey, async () => {
      const query = knexClient('assignments as a')
        .leftJoin('employees as e', 'e.id', 'a.employee_id')
        .select(
          'a.id',
          'a.employee_id as employeeId',
          'a.initiative_id as initiativeId',
          'a.role',
          'a.load',
          'a.created_at as createdAt',
          'a.updated_at as updatedAt',
          'e.full_name as employeeName',
          'e.position as employeePosition'
        )
        .orderBy('a.created_at', 'desc');

      if (initiativeId && typeof initiativeId === 'string') {
        query.where('a.initiative_id', initiativeId);
      }

      const assignments = await query;
      return assignments.map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        initiativeId: row.initiativeId,
        role: row.role,
        load: Number(row.load),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        employee: row.employeeId
          ? { id: row.employeeId, fullName: row.employeeName, position: row.employeePosition }
          : null
      }));
    });

    res.json(rows);
  } catch (error) {
    console.error('Failed to list assignments', error);
    res.status(500).json({ message: 'Не удалось получить распределения.' });
  }
});

app.post('/assignments', async (req, res) => {
  const { employeeId, initiativeId, role, load } = req.body ?? {};

  if (!employeeId || typeof employeeId !== 'string') {
    res.status(400).json({ message: 'Поле employeeId обязательно.' });
    return;
  }

  if (!initiativeId || typeof initiativeId !== 'string') {
    res.status(400).json({ message: 'Поле initiativeId обязательно.' });
    return;
  }

  if (!role || typeof role !== 'string') {
    res.status(400).json({ message: 'Поле role обязательно.' });
    return;
  }

  try {
    const employee = await knexClient('employees').where({ id: employeeId }).first();
    if (!employee) {
      res.status(404).json({ message: 'Сотрудник не найден.' });
      return;
    }

    const normalizedLoad = typeof load === 'number' ? load : Number(load ?? 0);

    const [created] = await knexClient('assignments')
      .insert({
        id: randomUUID(),
        employee_id: employeeId,
        initiative_id: initiativeId,
        role,
        load: Number.isFinite(normalizedLoad) ? normalizedLoad : 0,
        updated_at: knexClient.fn.now()
      })
      .returning([
        'id',
        'employee_id as employeeId',
        'initiative_id as initiativeId',
        'role',
        'load',
        'created_at as createdAt',
        'updated_at as updatedAt'
      ]);

    metricsCache.clear();
    res.status(201).json({
      ...created,
      load: Number(created.load),
      employee: { id: employee.id, fullName: employee.full_name, position: employee.position }
    });
  } catch (error) {
    console.error('Failed to create assignment', error);
    res.status(500).json({ message: 'Не удалось создать распределение.' });
  }
});

app.put('/assignments/:id', async (req, res) => {
  const { id } = req.params;
  const { employeeId, initiativeId, role, load } = req.body ?? {};

  try {
    const existing = await knexClient('assignments').where({ id }).first();
    if (!existing) {
      res.status(404).json({ message: 'Распределение не найдено.' });
      return;
    }

    if (employeeId && typeof employeeId === 'string') {
      const employee = await knexClient('employees').where({ id: employeeId }).first();
      if (!employee) {
        res.status(404).json({ message: 'Сотрудник не найден.' });
        return;
      }
    }

    const normalizedLoad = typeof load === 'number' ? load : Number(load ?? existing.load ?? 0);

    await knexClient('assignments')
      .where({ id })
      .update({
        employee_id: typeof employeeId === 'string' ? employeeId : existing.employee_id,
        initiative_id: typeof initiativeId === 'string' ? initiativeId : existing.initiative_id,
        role: typeof role === 'string' ? role : existing.role,
        load: Number.isFinite(normalizedLoad) ? normalizedLoad : existing.load,
        updated_at: knexClient.fn.now()
      });

    const [updated] = await knexClient('assignments as a')
      .leftJoin('employees as e', 'e.id', 'a.employee_id')
      .select(
        'a.id',
        'a.employee_id as employeeId',
        'a.initiative_id as initiativeId',
        'a.role',
        'a.load',
        'a.created_at as createdAt',
        'a.updated_at as updatedAt',
        'e.full_name as employeeName',
        'e.position as employeePosition'
      )
      .where('a.id', id);

    if (!updated) {
      res.status(404).json({ message: 'Распределение не найдено после обновления.' });
      return;
    }

    metricsCache.clear();
    res.json({
      ...updated,
      load: Number(updated.load),
      employee: updated.employeeId
        ? { id: updated.employeeId, fullName: updated.employeeName, position: updated.employeePosition }
        : null
    });
  } catch (error) {
    console.error('Failed to update assignment', error);
    res.status(500).json({ message: 'Не удалось обновить распределение.' });
  }
});

app.delete('/assignments/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await knexClient('assignments').where({ id }).del();
    if (!deleted) {
      res.status(404).json({ message: 'Распределение не найдено.' });
      return;
    }

    metricsCache.clear();
    res.status(204).end();
  } catch (error) {
    console.error('Failed to delete assignment', error);
    res.status(500).json({ message: 'Не удалось удалить распределение.' });
  }
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`workforce service listening on port ${port}`);
});

const shutdown = () => {
  console.log('Shutting down workforce service');
  void knexClient.destroy().finally(() => {
    server.close(() => {
      process.exit(0);
    });
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function loadSkillsForEmployees(employeeIds) {
  if (!employeeIds.length) {
    return new Map();
  }

  const rows = await knexClient('employee_skills as es')
    .join('skills as s', 's.id', 'es.skill_id')
    .select(
      'es.employee_id as employeeId',
      's.id',
      's.name',
      's.category',
      's.description',
      'es.proficiency'
    )
    .whereIn('es.employee_id', employeeIds)
    .orderBy(['s.name', 'es.employee_id']);

  return rows.reduce((acc, row) => {
    const list = acc.get(row.employeeId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      proficiency: row.proficiency ?? null
    });
    acc.set(row.employeeId, list);
    return acc;
  }, new Map());
}

async function loadAvailabilityByEmployee(employeeIds) {
  if (!employeeIds.length) {
    return new Map();
  }

  const rows = await knexClient('availability')
    .select(
      'employee_id as employeeId',
      'id',
      'date',
      'available_hours as availableHours',
      'note'
    )
    .whereIn('employee_id', employeeIds)
    .orderBy(['date', 'employee_id']);

  return rows.reduce((acc, row) => {
    const list = acc.get(row.employeeId) ?? [];
    list.push({
      id: row.id,
      date: row.date,
      availableHours: row.availableHours,
      note: row.note ?? null
    });
    acc.set(row.employeeId, list);
    return acc;
  }, new Map());
}

async function replaceAvailability(employeeId, availability) {
  if (!Array.isArray(availability)) {
    return;
  }

  await knexClient.transaction(async (trx) => {
    await trx('availability').where({ employee_id: employeeId }).del();

    if (!availability.length) {
      return;
    }

    const rows = availability.map((entry) => {
      if (!entry || typeof entry.date !== 'string') {
        throw new Error('Каждый элемент availability должен содержать поле date.');
      }

      const hours = typeof entry.availableHours === 'number' ? entry.availableHours : Number(entry.availableHours ?? 0);
      return {
        id: randomUUID(),
        employee_id: employeeId,
        date: entry.date,
        available_hours: Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : 0,
        note: typeof entry.note === 'string' ? entry.note : null,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now()
      };
    });

    await trx('availability').insert(rows);
  });
}
