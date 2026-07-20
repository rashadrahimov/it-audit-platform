import { getLocale, getTranslations } from 'next-intl/server';
import { createTaskAction, deleteTaskAction, updateTaskStatusAction } from '@/lib/task-actions';

export interface TaskItem {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
  dueDate: string | null;
  completedAt: string | null;
}

const STATUS_TONE: Record<string, string> = {
  open: 'bg-muted text-secondary',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700',
};
const NEXT: Record<string, string> = { open: 'in_progress', in_progress: 'done' };

/**
 * T-V27: полиморфный блок задач ремедиации — список + добавление + продвижение
 * статуса (open→in_progress→done) + удаление. Подключается на карточки
 * finding (Tasks) и risk (Action tracker).
 */
export async function TasksSection({
  entityType,
  entityId,
  path,
  tasks,
  members,
  testid,
  title,
}: {
  entityType: string;
  entityId: string;
  path: string;
  tasks: TaskItem[];
  members: Array<{ id: string; fullName: string }>;
  testid: string;
  title: string;
}) {
  const [t, locale] = await Promise.all([getTranslations('tasks'), getLocale()]);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const open = tasks.filter((x) => x.status !== 'done').length;

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      data-testid={testid}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        {tasks.length > 0 && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary tabular-nums">
            {t('openCount', { open, total: tasks.length })}
          </span>
        )}
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-secondary">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={`text-sm ${task.status === 'done' ? 'text-secondary line-through' : 'text-foreground'}`}
                >
                  {task.title}
                </span>
                <span className="flex flex-wrap gap-2 text-xs text-secondary">
                  {task.assignee && <span>{task.assignee}</span>}
                  {task.dueDate && (
                    <span className="tabular-nums">
                      {t('due')}: {dateFmt.format(new Date(task.dueDate))}
                    </span>
                  )}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONE[task.status] ?? 'bg-muted text-secondary'}`}
                >
                  {t(`st.${task.status}`)}
                </span>
                {NEXT[task.status] && (
                  <form
                    action={updateTaskStatusAction.bind(null, task.id, NEXT[task.status]!, path)}
                  >
                    <button
                      type="submit"
                      data-testid="task-advance"
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {task.status === 'open' ? t('start') : t('complete')}
                    </button>
                  </form>
                )}
                <form action={deleteTaskAction.bind(null, task.id, path)}>
                  <button
                    type="submit"
                    data-testid="task-delete"
                    aria-label={t('delete')}
                    className="rounded-md border border-border px-2 py-1 text-xs font-medium text-secondary transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    ✕
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form
        action={createTaskAction.bind(null, entityType, entityId, path)}
        className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
        data-testid="task-create"
      >
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-secondary">{t('titleLabel')}</span>
          <input
            name="title"
            required
            placeholder={t('titlePh')}
            className="rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        {members.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">{t('assignee')}</span>
            <select
              name="assigneeMembershipId"
              defaultValue=""
              className="rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="">—</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-secondary">{t('due')}</span>
          <input
            type="date"
            name="dueDate"
            className="rounded-md border border-border px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        <button
          type="submit"
          data-testid="task-add"
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-primary transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('add')}
        </button>
      </form>
    </section>
  );
}
