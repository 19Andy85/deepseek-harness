/** English project console copy. */
export const en = {
  panel: 'Project console',
  title: 'Project console',
  description: 'Live sessions and the activity families still running in this project.',
  loading: 'Loading live sessions…',
  empty: 'No live sessions in this project yet.',
  error: 'Could not read the live sessions. Retry, or check the plugin connection.',
}

/** Keys shared by every dictionary. */
export type ProjectConsoleKey = keyof typeof en

/** Chinese project console copy. */
export const zh: Record<ProjectConsoleKey, string> = {
  panel: '项目控制台',
  title: '项目控制台',
  description: '本项目中的活跃会话，以及每个会话仍在运行的活动家族。',
  loading: '正在读取活跃会话…',
  empty: '本项目当前没有活跃会话。',
  error: '无法读取活跃会话，请重试或检查插件连接。',
}

/** Japanese copy. */
export const ja: Record<ProjectConsoleKey, string> = {
  panel: 'プロジェクトコンソール',
  title: 'プロジェクトコンソール',
  description: 'このプロジェクトで稼働中のセッションと活動種別。',
  loading: '実行中セッションを読み込み中…',
  empty: 'このプロジェクトに実行中セッションはありません。',
  error: '実行中セッションを読み取れませんでした。再試行するか、プラグイン接続を確認してください。',
}

/** Spanish copy. */
export const es: Record<ProjectConsoleKey, string> = {
  panel: 'Consola del proyecto',
  title: 'Consola del proyecto',
  description: 'Sesiones activas y las familias de actividad que siguen ejecutándose en este proyecto.',
  loading: 'Cargando sesiones activas…',
  empty: 'Aún no hay sesiones activas en este proyecto.',
  error: 'No se pudieron leer las sesiones activas. Reintenta o revisa la conexión del plugin.',
}

/** French copy. */
export const fr: Record<ProjectConsoleKey, string> = {
  panel: 'Console du projet',
  title: 'Console du projet',
  description: 'Sessions actives et familles d’activité encore en cours dans ce projet.',
  loading: 'Chargement des sessions actives…',
  empty: 'Aucune session active dans ce projet pour l’instant.',
  error: 'Impossible de lire les sessions actives. Réessayez ou vérifiez la connexion du plugin.',
}

/** German copy. */
export const de: Record<ProjectConsoleKey, string> = {
  panel: 'Projektkonsole',
  title: 'Projektkonsole',
  description: 'Aktive Sitzungen und weiterhin laufende Aktivitätsfamilien in diesem Projekt.',
  loading: 'Aktive Sitzungen werden geladen…',
  empty: 'In diesem Projekt sind noch keine Sitzungen aktiv.',
  error: 'Die aktiven Sitzungen konnten nicht gelesen werden. Versuche es erneut oder prüfe die Plugin-Verbindung.',
}

/** Russian copy. */
export const ru: Record<ProjectConsoleKey, string> = {
  panel: 'Консоль проекта',
  title: 'Консоль проекта',
  description: 'Активные сеансы и продолжающиеся семейства активности в этом проекте.',
  loading: 'Загрузка активных сеансов…',
  empty: 'В этом проекте пока нет активных сеансов.',
  error: 'Не удалось прочитать активные сеансы. Повторите попытку или проверьте подключение плагина.',
}

/** Portuguese copy. */
export const pt: Record<ProjectConsoleKey, string> = {
  panel: 'Consola do projeto',
  title: 'Consola do projeto',
  description: 'Sessões ativas e as famílias de atividade ainda em execução neste projeto.',
  loading: 'A carregar sessões ativas…',
  empty: 'Ainda não há sessões ativas neste projeto.',
  error: 'Não foi possível ler as sessões ativas. Tente novamente ou verifique a ligação do plugin.',
}
