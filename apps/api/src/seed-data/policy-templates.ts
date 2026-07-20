/**
 * T-V24: библиотека шаблонов политик (Vanta Policy Templates-паритет).
 * «Создать из шаблона» рождает политику + markdown-документ (EN/AZ/RU) + версию v1.
 */

export interface PolicyTemplate {
  key: string;
  title: { en: string; az: string; ru: string };
  body: { en: string; az: string; ru: string };
}

const t = (
  key: string,
  title: PolicyTemplate['title'],
  sections: Array<{ en: string; az: string; ru: string }>,
): PolicyTemplate => ({
  key,
  title,
  body: {
    en: `# ${title.en}\n\n${sections.map((s, i) => `## ${i + 1}. ${s.en}`).join('\n\n')}\n`,
    az: `# ${title.az}\n\n${sections.map((s, i) => `## ${i + 1}. ${s.az}`).join('\n\n')}\n`,
    ru: `# ${title.ru}\n\n${sections.map((s, i) => `## ${i + 1}. ${s.ru}`).join('\n\n')}\n`,
  },
});

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  t(
    'information-security',
    {
      en: 'Information Security Policy',
      az: 'İnformasiya Təhlükəsizliyi Siyasəti',
      ru: 'Политика информационной безопасности',
    },
    [
      {
        en: 'Purpose and scope\n\nDefine why the policy exists, what assets and people it covers.',
        az: 'Məqsəd və əhatə dairəsi\n\nSiyasətin mövcudluq səbəbini, əhatə etdiyi aktivləri və insanları müəyyən edin.',
        ru: 'Цель и область действия\n\nЗачем существует политика, какие активы и каких людей охватывает.',
      },
      {
        en: 'Roles and responsibilities\n\nCISO, IT, employees: who owns what.',
        az: 'Rollar və məsuliyyətlər\n\nCISO, İT, əməkdaşlar: kim nəyə cavabdehdir.',
        ru: 'Роли и обязанности\n\nCISO, ИТ, сотрудники: кто за что отвечает.',
      },
      {
        en: 'Security principles\n\nCIA triad, least privilege, defense in depth.',
        az: 'Təhlükəsizlik prinsipləri\n\nCIA triadası, minimal imtiyaz, çoxqatlı müdafiə.',
        ru: 'Принципы безопасности\n\nТриада CIA, минимальные привилегии, эшелонированная защита.',
      },
      {
        en: 'Policy review\n\nAnnual review cycle and exception handling.',
        az: 'Siyasətə baxış\n\nİllik baxış dövrü və istisnaların idarə edilməsi.',
        ru: 'Пересмотр политики\n\nЕжегодный цикл пересмотра и работа с исключениями.',
      },
    ],
  ),
  t(
    'access-control',
    {
      en: 'Access Control Policy',
      az: 'Girişə Nəzarət Siyasəti',
      ru: 'Политика управления доступом',
    },
    [
      {
        en: 'Account lifecycle\n\nJoiner–mover–leaver: provisioning, changes, deprovisioning within SLA.',
        az: 'Hesabların dövriyyəsi\n\nJoiner–mover–leaver: yaratma, dəyişikliklər, SLA daxilində ləğv.',
        ru: 'Жизненный цикл учёток\n\nJoiner–mover–leaver: выдача, изменения, отзыв в рамках SLA.',
      },
      {
        en: 'Least privilege and RBAC\n\nAccess by role; privileged access separately approved.',
        az: 'Minimal imtiyaz və RBAC\n\nRol üzrə giriş; imtiyazlı giriş ayrıca təsdiqlənir.',
        ru: 'Минимальные привилегии и RBAC\n\nДоступ по роли; привилегированный — отдельное одобрение.',
      },
      {
        en: 'Authentication\n\nPassword standard, MFA for remote and privileged access.',
        az: 'Autentifikasiya\n\nParol standartı, uzaqdan və imtiyazlı giriş üçün MFA.',
        ru: 'Аутентификация\n\nПарольный стандарт, MFA для удалённого и привилегированного доступа.',
      },
      {
        en: 'Access reviews\n\nQuarterly user access reviews with documented decisions.',
        az: 'Giriş baxışları\n\nRüblük istifadəçi giriş baxışları, sənədləşdirilmiş qərarlar.',
        ru: 'Пересмотры доступа\n\nЕжеквартальные UAR с документированными решениями.',
      },
    ],
  ),
  t(
    'business-continuity',
    {
      en: 'Business Continuity Plan',
      az: 'Biznesin Fasiləsizliyi Planı',
      ru: 'План непрерывности бизнеса',
    },
    [
      {
        en: 'Critical processes and RTO/RPO\n\nInventory of critical services with recovery objectives.',
        az: 'Kritik proseslər və RTO/RPO\n\nBərpa hədəfləri ilə kritik xidmətlərin inventarı.',
        ru: 'Критичные процессы и RTO/RPO\n\nПеречень критичных сервисов с целями восстановления.',
      },
      {
        en: 'Continuity strategies\n\nRedundancy, alternate sites, workarounds.',
        az: 'Fasiləsizlik strategiyaları\n\nEhtiyatlılıq, alternativ saytlar, müvəqqəti həllər.',
        ru: 'Стратегии непрерывности\n\nРезервирование, альтернативные площадки, обходные решения.',
      },
      {
        en: 'Incident activation\n\nWho declares disruption, communication tree.',
        az: 'Aktivləşdirmə\n\nFasiləni kim elan edir, kommunikasiya ağacı.',
        ru: 'Активация\n\nКто объявляет сбой, дерево оповещения.',
      },
      {
        en: 'Testing\n\nAnnual BCP exercise with lessons learned.',
        az: 'Test\n\nİllik BCP məşqi və çıxarılan dərslər.',
        ru: 'Тестирование\n\nЕжегодные учения BCP с разбором уроков.',
      },
    ],
  ),
  t(
    'incident-response',
    {
      en: 'Incident Response Policy',
      az: 'İnsidentlərə Reaksiya Siyasəti',
      ru: 'Политика реагирования на инциденты',
    },
    [
      {
        en: 'Definitions and severity\n\nWhat is an incident; severity levels and examples.',
        az: 'Təriflər və kritiklik\n\nİnsident nədir; kritiklik səviyyələri və nümunələr.',
        ru: 'Определения и критичность\n\nЧто считается инцидентом; уровни и примеры.',
      },
      {
        en: 'Response phases\n\nDetect, triage, contain, eradicate, recover, learn.',
        az: 'Reaksiya mərhələləri\n\nAşkarlama, triaj, məhdudlaşdırma, aradan qaldırma, bərpa, dərslər.',
        ru: 'Фазы реагирования\n\nОбнаружение, триаж, сдерживание, устранение, восстановление, уроки.',
      },
      {
        en: 'Notification\n\nInternal escalation and regulatory notification deadlines.',
        az: 'Bildiriş\n\nDaxili eskalasiya və tənzimləyici bildiriş müddətləri.',
        ru: 'Уведомления\n\nВнутренняя эскалация и сроки уведомления регулятора.',
      },
      {
        en: 'Evidence handling\n\nPreserve logs and artifacts for investigation.',
        az: 'Sübutlarla iş\n\nAraşdırma üçün loq və artefaktları qoruyun.',
        ru: 'Работа с доказательствами\n\nСохранение логов и артефактов для расследования.',
      },
    ],
  ),
  t(
    'change-management',
    {
      en: 'Change Management Policy',
      az: 'Dəyişikliklərin İdarə Edilməsi Siyasəti',
      ru: 'Политика управления изменениями',
    },
    [
      {
        en: 'Change types\n\nStandard, normal, emergency — approval paths for each.',
        az: 'Dəyişiklik növləri\n\nStandart, adi, təcili — hər biri üçün təsdiq yolu.',
        ru: 'Типы изменений\n\nСтандартные, обычные, экстренные — пути согласования.',
      },
      {
        en: 'Approval and testing\n\nCAB review, test evidence before production.',
        az: 'Təsdiq və test\n\nCAB baxışı, prod-dan əvvəl test sübutları.',
        ru: 'Согласование и тестирование\n\nCAB, тестовые подтверждения до прода.',
      },
      {
        en: 'Rollback\n\nEvery change ships with a rollback plan.',
        az: 'Geri qaytarma\n\nHər dəyişiklik rollback planı ilə gedir.',
        ru: 'Откат\n\nКаждое изменение сопровождается планом отката.',
      },
      {
        en: 'Emergency changes\n\nPost-implementation review within 5 business days.',
        az: 'Təcili dəyişikliklər\n\n5 iş günü ərzində sonrakı baxış.',
        ru: 'Экстренные изменения\n\nПост-обзор в течение 5 рабочих дней.',
      },
    ],
  ),
  t(
    'backup',
    {
      en: 'Backup and Recovery Policy',
      az: 'Ehtiyat Nüsxə və Bərpa Siyasəti',
      ru: 'Политика резервного копирования',
    },
    [
      {
        en: 'Scope and schedule\n\nWhat is backed up, frequency, retention.',
        az: 'Əhatə və cədvəl\n\nNə nüsxələnir, tezlik, saxlama müddəti.',
        ru: 'Охват и расписание\n\nЧто копируется, частота, сроки хранения.',
      },
      {
        en: 'Storage and protection\n\nOffsite/immutable copies, encryption.',
        az: 'Saxlama və qorunma\n\nKənar/dəyişməz nüsxələr, şifrələmə.',
        ru: 'Хранение и защита\n\nВнешние/неизменяемые копии, шифрование.',
      },
      {
        en: 'Monitoring\n\nFailed jobs alerting and follow-up.',
        az: 'Monitorinq\n\nUğursuz tapşırıqlar üzrə xəbərdarlıq və izləmə.',
        ru: 'Мониторинг\n\nАлерты по сбоям и их отработка.',
      },
      {
        en: 'Restore testing\n\nQuarterly restore tests with documented results.',
        az: 'Bərpa testləri\n\nSənədləşdirilmiş nəticələrlə rüblük bərpa testləri.',
        ru: 'Тесты восстановления\n\nЕжеквартальные тесты с документированием результатов.',
      },
    ],
  ),
  t(
    'data-protection',
    {
      en: 'Data Protection Policy',
      az: 'Məlumatların Qorunması Siyasəti',
      ru: 'Политика защиты данных',
    },
    [
      {
        en: 'Data classification\n\nPublic, internal, confidential, restricted — handling rules.',
        az: 'Məlumat təsnifatı\n\nAçıq, daxili, konfidensial, məhdud — işləmə qaydaları.',
        ru: 'Классификация данных\n\nПубличные, внутренние, конфиденциальные, ограниченные — правила обращения.',
      },
      {
        en: 'Personal data\n\nLawful bases, minimization, subject rights.',
        az: 'Fərdi məlumatlar\n\nHüquqi əsaslar, minimallaşdırma, subyekt hüquqları.',
        ru: 'Персональные данные\n\nПравовые основания, минимизация, права субъектов.',
      },
      {
        en: 'Encryption\n\nAt rest and in transit; key management.',
        az: 'Şifrələmə\n\nSaxlamada və ötürülmədə; açarların idarə edilməsi.',
        ru: 'Шифрование\n\nПри хранении и передаче; управление ключами.',
      },
      {
        en: 'Retention and disposal\n\nRetention schedule and secure disposal.',
        az: 'Saxlama və məhvetmə\n\nSaxlama cədvəli və təhlükəsiz məhvetmə.',
        ru: 'Хранение и уничтожение\n\nГрафик хранения и безопасное уничтожение.',
      },
    ],
  ),
  t(
    'acceptable-use',
    {
      en: 'Acceptable Use Policy',
      az: 'Məqbul İstifadə Siyasəti',
      ru: 'Политика допустимого использования',
    },
    [
      {
        en: 'Company assets\n\nPermitted use of devices, email, internet, cloud tools.',
        az: 'Şirkət aktivləri\n\nCihazlar, e-poçt, internet, bulud alətlərinin icazəli istifadəsi.',
        ru: 'Активы компании\n\nДопустимое использование устройств, почты, интернета, облаков.',
      },
      {
        en: 'Prohibited actions\n\nUnlicensed software, data exfiltration, credential sharing.',
        az: 'Qadağalar\n\nLisenziyasız PT, məlumat sızması, hesab paylaşımı.',
        ru: 'Запреты\n\nНелицензионное ПО, вынос данных, передача учёток.',
      },
      {
        en: 'Monitoring notice\n\nWhat the company logs and why.',
        az: 'Monitorinq bildirişi\n\nŞirkət nəyi və nə üçün loqlayır.',
        ru: 'Уведомление о мониторинге\n\nЧто и зачем логирует компания.',
      },
      {
        en: 'Violations\n\nDisciplinary consequences and reporting channel.',
        az: 'Pozuntular\n\nİntizam nəticələri və bildiriş kanalı.',
        ru: 'Нарушения\n\nДисциплинарные последствия и канал сообщений.',
      },
    ],
  ),
];
