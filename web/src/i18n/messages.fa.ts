/**
 * The Persian catalogue — one entry per key in `messages.en.ts`, written for this interface.
 *
 * `Record<MessageKey, string>` is what makes the work provably finished rather than nearly finished: a key
 * without a Persian sentence is a compile error, and `translate` can therefore treat the language as total.
 *
 * The wording follows the terminology record in `docs/persian-terminology.md` (Phase 7.5.2) for every
 * trading and product concept, so the same idea is the same word on every screen. Figures use Persian
 * digits (`formatFaNumber`), and a value that is a product name, a unit or a code stays exactly as the
 * English catalogue has it — the suite names the exceptions rather than allowing them quietly.
 */

import type { MessageKey } from './messages.en.js';

export const FA_MESSAGES: Record<MessageKey, string> = {
  // aIReviewPanel ───────────────────────────────────────────────
  'aIReviewPanel.aProviderIsGeneratingAReviewProgressIs':
    'یک ارائه‌دهنده در حال تولید بازبینی است. پیشرفت توسط صف کارها گزارش می‌شود و هرگز اینجا برای پرمشغله‌تر به‌نظر رسیدن انیمیت نمی‌شود.',
  'aIReviewPanel.noReviewProviderIsConnectedToTheJournal':
    'هیچ ارائه‌دهنده بازبینی به دفتر معاملات متصل نیست. این پنل وجود دارد تا سطح رابط پیش از رسیدن قابلیت طراحی شده باشد.',
  'aIReviewPanel.openQuestionsForTheTraderEachTiedTo':
    'پرسش‌های باز برای معامله‌گر، هر یک پیوسته به یک سابقه مشخص. بازبینی مطالعه پیشنهاد می‌کند، نه تغییر قاعده و نه تصمیم زنده.',
  'aIReviewPanel.plannedVersusCommittedRiskWithTheDivergenceFlagged':
    'ریسک برنامه‌ریزی‌شده در برابر ریسک متعهدشده، با علامت‌گذاری اختلاف. اعداد از سابقه می‌آیند؛ بازبینی می‌تواند آن‌ها را توضیح دهد اما هرگز تولید نمی‌کند.',
  'aIReviewPanel.processAdherence': 'پایبندی به فرایند',
  'aIReviewPanel.retryTheReviewRequest': 'تلاش دوباره برای درخواست بازبینی',
  'aIReviewPanel.riskAndSizing': 'ریسک و اندازه‌گذاری',
  'aIReviewPanel.theLayoutACompletedReviewWillTakeEvery':
    'چیدمانی که یک بازبینی کامل به خود می‌گیرد. هر فیلد به‌حکم ساخت خالی است — در این فاز هیچ خروجی مدلی وجود ندارد.',
  'aIReviewPanel.theRequestFailedThePanelReportsTheTyped':
    'درخواست شکست خورد. پنل دلیل تایپ‌شده را گزارش می‌کند و تلاش دوباره ارائه می‌دهد، چون یک بازبینی ناموفق نباید مثل یک بازبینی خالی به نظر برسد.',
  'aIReviewPanel.theReviewRequestIsQueuedAndHasNot':
    'درخواست بازبینی در صف است و به هیچ ارائه‌دهنده‌ای فرستاده نشده است. هنوز چیزی در جریان نیست.',
  'aIReviewPanel.whatToExamineNext': 'آنچه باید بعد بررسی شود',
  'aIReviewPanel.whereTheRecordShowsThePlanWasFollowed':
    'جایی که سابقه نشان می‌دهد طرح رعایت شده است و جایی که نشده. فیلدها از چک‌لیست و سابقه پر می‌شوند، نه از بازبینی.',
  // aboutDialog ─────────────────────────────────────────────────
  'aboutDialog.smarterTradingBiggerPossibilities': 'معامله‌ای هوشمندانه‌تر. امکاناتی بزرگ‌تر.',
  // academy ─────────────────────────────────────────────────────
  'academy.academy': 'آکادمی',
  'academy.academySections': 'بخش‌های آکادمی',
  'academy.and': 'و',
  'academy.answersAreScoredAgainstARubric':
    'پاسخ‌ها بر پایهٔ یک شیوه‌نامه سنجیده می‌شوند، نه بر پایهٔ نظر مدل.',
  'academy.bestScorePerExamination': 'بهترین نمره در هر آزمون',
  'academy.curriculumProgress': 'پیشرفت برنامه درسی',
  'academy.examAverage': 'میانگین آزمون',
  'academy.examRunnerIsNotPartOf': 'موتور اجرای آزمون در این مرحله وجود ندارد',
  'academy.examinationIntegrity': 'صحت آزمون',
  'academy.explanationsCarry': 'توضیح‌ها همراه‌اند با',
  'academy.gradingIsRubricBasedAndDeterministic':
    'نمره‌گذاری بر پایهٔ شیوه‌نامه و قطعی است؛ مدل دربارهٔ قبولی یا رد تصمیم نمی‌گیرد.',
  'academy.howGradingWorks': 'نمره‌گذاری چگونه انجام می‌شود',
  'academy.labels': 'برچسب‌ها.',
  'academy.lessonStatesAndPrerequisiteGating': 'وضعیت درس‌ها و قفل بودن بر پایهٔ پیش‌نیاز',
  'academy.lessons': 'درس',
  'academy.lessonsComplete': 'درس کامل‌شده',
  'academy.lessonsComplete2': 'درس‌های کامل‌شده',
  'academy.locked': 'قفل‌شده',
  'academy.module2RiskFirst': 'ماژول ۲ — ریسک در اولویت',
  'academy.progressIsRecordedPerLessonNever':
    'پیشرفت به‌ازای هر درس ثبت می‌شود و هرگز از زمان صرف‌شده حدس زده نمی‌شود.',
  'academy.questions': 'پرسش',
  'academy.ruleChangesProposedDuringStudyRequire':
    'تغییرهای قواعدی که در جریان آموزش پیشنهاد می‌شوند، پیش از فعال شدن به تأیید انسانی نیاز دارند.',
  'academy.sixMonthCurriculum': 'برنامه درسی شش‌ماهه',
  'academy.statesThisCurriculumSurfaceOwesYou':
    'وضعیت‌هایی که این صفحهٔ برنامه درسی به شما بدهکار است',
  'academy.whatTheAcademyGuarantees': 'آکادمی چه چیزی را تضمین می‌کند',
  // academyPage ─────────────────────────────────────────────────
  'academyPage.aFailedReadIsReportedWithItsTyped':
    'خواندن ناموفق با کد تایپ‌شده‌اش گزارش می‌شود، نه با فهرست خالی، چون دوره خالی و دوره خوانده‌نشدنی کنش‌های متفاوتی می‌طلبند.',
  'academyPage.aSixMonthCurriculumFromMarketMechanicsToIndependent':
    'دوره‌ای شش‌ماهه از مکانیک بازار تا فعالیت مستقل. درس‌ها بر اساس پیش‌نیاز باز می‌شوند؛ آزمون‌ها به‌صورت قطعی تصحیح می‌شوند.',
  'academyPage.curriculumCouldNotBeRead': 'دوره آموزشی خوانده نشد',
  'academyPage.eachModuleListsItsFocusAreasLockedModules':
    'هر ماژول حوزه‌های تمرکز خود را فهرست می‌کند. ماژول‌های قفل وقتی پیش‌نیازها کامل شوند باز می‌شوند.',
  'academyPage.moduleSkeletonsHoldTheLayoutWhileTheCurriculum':
    'اسکلت‌های ماژول تا زمان خواندن دوره، چیدمان را نگه می‌دارند، تا کارت‌های باز و قفل جابه‌جا نشوند.',
  'academyPage.progressIsRecordedPerLessonAgainstTheReal':
    'وقتی بخش ماندگارسازی اضافه شود، پیشرفت برای هر درس در برابر دوره واقعی ثبت می‌شود؛ هیچ چیز اینجا از زمان صرف‌شده استنتاج نمی‌شود.',
  'academyPage.readingTheCurriculum': 'خواندن دوره آموزشی',
  'academyPage.theInterfaceForTakingAnExamWillBe':
    'رابط برگزاری آزمون همراه با بخش ماندگارسازی اضافه خواهد شد، زمانی که درس‌ها و تلاش‌ها واقعاً قابل ذخیره و تصحیح باشند.',
  'academyPage.theModuleListIsStaticInThisPreview':
    'فهرست ماژول‌ها در این پیش‌نمایش ثابت است. این‌ها دو حالتی هستند که پس از خواندن درس‌ها از بک‌اند استفاده خواهد کرد؛ حالت خالی در برگه آزمون‌ها نشان داده شده است.',
  'academyPage.unlocksWhenPrerequisiteLessonsAreComplete':
    'وقتی درس‌های پیش‌نیاز کامل شوند باز می‌شود.',
  'academyPage.untilThenThisTabShowsThePlannedShape':
    'تا آن زمان این برگه شکل برنامه‌ریزی‌شده را نشان می‌دهد، نه یک آزمون کارکننده.',
  // activity ────────────────────────────────────────────────────
  'activity.aPayloadThatFailsItsContract':
    'داده‌ای که قرارداد خود را نقض کند، یا نوعی که این نسخه نمی‌شناسد، شمرده و رد می‌شود. نمایش دادنش هم‌معنی چاپ ساختاری است که هیچ‌کس اعتبارسنجی نکرده است.',
  'activity.aReplayGapWasDetectedIn': 'در این نشست وقفه‌ای در بازپخش شناسایی شد',
  'activity.activitySections': 'بخش‌های فعالیت‌ها',
  'activity.available': 'در دسترس',
  'activity.backoffThenStop': 'عقب‌نشینی تدریجی، سپس توقف',
  'activity.bothActionsGoThroughTheSame':
    'هر دو کار از همان نشست احراز هویت‌شدهٔ جریان عبور می‌کنند.',
  'activity.defaultTypes': 'انواع پیش‌فرض',
  'activity.deliveredVsDroppedFrames': 'قاب‌های رسیده در مقابل قاب‌های افتاده',
  'activity.endpoint': 'نقطهٔ پایانی',
  'activity.everyEventCarriesAMonotonicSequence':
    'هر رویداد شمارهٔ ترتیبی یکنوا دارد. رویداد تکراری یا قدیمی‌تر حذف می‌شود، پس اتصال دوباره نمی‌تواند جریان را به عقب برگرداند — و شمار قاب‌های افتاده بالای همین صفحه دیده می‌شود.',
  'activity.frameSDroppedStaleOrUnreadable':
    'قاب حذف شد — کهنه یا ناخوانا. قاب حذف‌شده شمرده می‌شود و هرگز به‌عنوان قاب پذیرفته‌شده نمایش داده نمی‌شود.',
  'activity.frameValidation': 'اعتبارسنجی قاب',
  'activity.heartbeat': 'ضربان',
  'activity.ifTheServerSBufferNo':
    'اگر بافر سرور دیگر آن نقطه را پوشش ندهد، کارخواه وقفه را ثبت می‌کند و اعلامش می‌کند، به‌جای آنکه از شمارنده‌ای که پیوسته به نظر می‌رسد ادامه دهد.',
  'activity.inboundFramesAreBoundedParsedAnd':
    'قاب‌های ورودی کران‌دار، تجزیه و با فهرست قراردادها بررسی می‌شوند، پیش از آنکه کاری با آن‌ها انجام شود. قاب ناسالم شمرده و حذف می‌شود و هرگز نمایش داده نمی‌شود.',
  'activity.internalEventsNeverArrive': 'رویدادهای داخلی هرگز نمی‌رسند',
  'activity.kind.backtest.run': 'اجرای آزمون گذشته‌نگر (نیازمند تأیید)',
  'activity.kind.dataset.process': 'اعتبارسنجی و نمایه‌سازی یک مجموعه‌داده',
  'activity.kind.embedding.generate': 'تولید بردارهای معنایی',
  'activity.kind.evaluation.scheduled': 'ارزیابی زمان‌بندی‌شدهٔ ناسازگاری‌ها',
  'activity.kind.maintenance.cleanup': 'پاک‌سازی داده‌های موقت منقضی‌شده',
  'activity.kind.marketData.ingest': 'دریافت کندل‌های نرمال‌شده',
  'activity.kind.memory.index': 'نمایه‌سازی رکوردهای حافظه',
  'activity.kind.report.generate': 'تولید گزارش',
  'activity.kind.training.gradeSession': 'نمره‌گذاری یک نشست آموزشی',
  'activity.kind.training.progress': 'محاسبهٔ دوبارهٔ پیشرفت برنامه درسی',
  'activity.lifecycle': 'چرخهٔ عمر',
  'activity.more': 'بیشتر',
  'activity.noLiveStreamInThisSession': 'در این نشست جریان زنده‌ای وجود ندارد',
  'activity.noNoticesInThisSession': 'در این نشست اطلاعیه‌ای وجود ندارد',
  'activity.previewFixtures': 'داده‌های نمونهٔ پیش‌نمایش',
  'activity.queue': 'صف',
  'activity.raisedByThisClientAboutThe':
    'توسط همین کارخواه و دربارهٔ خود جریان مطرح شده‌اند — وقفه‌ای در پوشش بازپخش، قابی ردشده، اشتراکی ردشده. نگه داشته می‌شوند چون حفرهٔ خاموش بدتر است.',
  'activity.reReadTheQueue': 'بازخوانی صف',
  'activity.resumeReplayAndTheHonestGap': 'ادامه، بازپخش و وقفهٔ صادقانه',
  'activity.retriesUseBoundedExponentialBackoffWith':
    'تلاش‌های دوباره با عقب‌نشینی نمای کران‌دار و بی‌نظمی انجام می‌شود. توکن ردشده، ناهمخوانی پروتکل یا اشتراک ردشده پایانی است: وضعیت به «مجاز نیست» می‌رود و تلاش دیگری انجام نمی‌شود.',
  'activity.retryTheStreamNow': 'همین حالا جریان را دوباره امتحان کن',
  'activity.roles': 'نقش‌ها',
  'activity.sequenceNotArrivalOrder': 'ترتیب شماره، نه ترتیب رسیدن',
  'activity.serverNoticesAndStreamWarnings': 'اطلاعیه‌های سرور و هشدارهای جریان',
  'activity.session': 'نشست',
  'activity.showingCapturedFixtures': 'نمایش داده‌های نمونهٔ ثبت‌شده',
  'activity.socket': 'سوکت',
  'activity.source': 'منبع',
  'activity.stream': 'جریان',
  'activity.subscribeToEverythingThisRoleMay': 'اشتراک در هر چیزی که این نقش مجاز است دریافت کند',
  'activity.subscription': 'اشتراک',
  'activity.theClientPingsOnTheServer':
    'کارخواه با آهنگ سرور ضربان می‌فرستد و بی‌پاسخ ماندن آن را شکست می‌شمارد. سوکتی که باز اما خاموش است جریان سالمی نیست، و نمایش «زنده» برای آن همان خطایی است که این بررسی برای جلوگیری از آن وجود دارد.',
  'activity.theClientRemembersTheHighestSequence':
    'کارخواه بالاترین شماره‌ای را که تحویل گرفته به یاد می‌سپارد و از سرور می‌خواهد از همان‌جا بازپخش کند، در همان قابی که توکن را می‌فرستد — کارخواهی که نخست احراز هویت کند و بعد مشترک شود، همان بازپخشی را که خواسته از دست می‌دهد.',
  'activity.theTokenIsNeverRenderedNever':
    'توکن هرگز نمایش داده نمی‌شود، هرگز ثبت نمی‌شود و هرگز در نشانی قرار نمی‌گیرد. در نخستین قاب فرستاده می‌شود و تنها اعتبارنامه‌هایی به کار می‌رود که پوسته تحویل داده است.',
  'activity.toolExecutionDetailAndAuditRecords':
    'جزئیات اجرای ابزار و رکوردهای حسابرسی داخلی‌اند: سرور از دادن مخاطب به آن‌ها سر باز می‌زند، پس هیچ اشتراکی نمی‌تواند آن‌ها را بخواهد و هیچ داده‌ای نمی‌رسد که پنهان شود.',
  'activity.unknownTypesAreDropped': 'انواع ناشناخته حذف می‌شوند',
  'activity.whatAReconnectKeeps': 'اتصال دوباره چه چیزی را حفظ می‌کند',
  'activity.whatThisClientAskedToReceive': 'آنچه این کارخواه درخواست دریافتش را کرده است',
  'activity.whereThisClientIsPointedAnd': 'این کارخواه به کجا نشانه رفته و با چه چیزی',
  // activityPage ────────────────────────────────────────────────
  'activityPage.aRetryableFailureReturnsToQueuedWithBackoff':
    'شکست قابل تلاش دوباره با عقب‌نشینی تدریجی به صف بازمی‌گردد؛ شکست غیرقابل تلاش دوباره فوراً متوقف می‌شود.',
  'activityPage.aWorkerClaimedTheJobAndHoldsA':
    'یک کارگر کار را تصاحب کرده و یک اجاره در اختیار دارد؛ تا زمانی که اجرا می‌شود اجاره تمدید می‌شود.',
  'activityPage.connectToSeeRealEntriesTheRowsBelow':
    'برای دیدن مدخل‌های واقعی متصل شوید؛ سطرهای زیر این اطلاع، فیکسچرهای پیش‌نمایش برچسب‌دار هستند.',
  'activityPage.connection': 'اتصال',
  'activityPage.deterministicSamplesSoTheSeverityLevelsCanBe':
    'نمونه‌های قطعی، تا سطوح شدت بدون سرور بررسی شوند.',
  'activityPage.eventStream': 'جریان رویداد',
  'activityPage.nothingHasArrivedYet': 'هنوز چیزی نرسیده است',
  'activityPage.someEventsBetweenTheDeliveredSequenceAndThe':
    'برخی رویدادها بین توالی تحویل‌شده و بافر سرور هرگز دیده نشدند. صف و رد حسابرسی، سابقه آنچه رخ داده است؛ این جریان نه.',
  'activityPage.theEventStreamOpensOverAnAuthenticatedWebSocket':
    'جریان رویداد تنها از طریق یک WebSocket احراز هویت‌شده روی رابط loopback باز می‌شود.',
  'activityPage.theFourTransitionsTheQueueDefinesAndWhat':
    'چهار گذاری که صف تعریف می‌کند، و آنچه رابط برای هر یک نشان می‌دهد.',
  'activityPage.theRealtimeEventStreamAndTheBackgroundTaskQueue':
    'جریان رویداد بلادرنگ و صف کارهای پس‌زمینه. رویدادها یک نوع قرارداد، یک توالی، یک منبع و یک شناسه همبستگی حمل می‌کنند؛ کارها از صفی که آن‌ها را اجرا می‌کند خوانده می‌شوند. هیچ‌کدام از این سطوح برای ثبت یا اجرای چیزی وجود ندارد.',
  'activityPage.theResultIsStoredAndTheProgressRow':
    'نتیجه ذخیره می‌شود و سطر پیشرفت باقی می‌ماند تا منقضی شود.',
  'activityPage.theStatusIsRecordedInTheRowSo':
    'وضعیت در سطر ثبت می‌شود، پس لغو از میان فرایندها می‌گذرد و از راه‌اندازی دوباره جان سالم به‌در می‌برد.',
  // agent ───────────────────────────────────────────────────────
  'agent.aIWorkspace': 'فضای کار هوش مصنوعی',
  'agent.activationIsImpossibleWithoutARecorded':
    'فعال‌سازی بدون تأیید ثبت‌شدهٔ انسان ناممکن است؛ خودکارسازی نمی‌تواند خود را مجاز کند.',
  'agent.awaitingYourApprovalSelfApprovalIs':
    'در انتظار تأیید شما — تأیید پیشنهاددهندهٔ خودش پذیرفته نمی‌شود',
  'agent.contextSections': 'بخش‌های زمینه',
  'agent.conversation': 'گفت‌وگو',
  'agent.deterministicEvaluationAttached': 'ارزیابی قطعی پیوست‌شده',
  'agent.eachMessageShowsItsEpistemicLabel': 'هر پیام برچسب شناختی و منابع خود را نشان می‌دهد',
  'agent.epistemicLabels': 'برچسب‌های شناختی:',
  'agent.examples': 'نمونه‌ها',
  'agent.mockTranscript': 'متن نمونه',
  'agent.noModelProviderIsConfigured': 'هیچ ارائه‌دهندهٔ مدلی تنظیم نشده است',
  'agent.proposedRule': 'قاعدهٔ پیشنهادی',
  'agent.ruleProposals': 'پیشنهادهای قاعده',
  'agent.runContext': 'زمینهٔ اجرا',
  'agent.sources': 'منابع',
  'agent.statesATurnGoesThrough': 'وضعیت‌هایی که یک نوبت از آن‌ها می‌گذرد',
  'agent.theGatewayHoldsNoToolRegistry':
    'درگاه هیچ فهرست ابزاری ندارد و هیچ روش اجرایی ارائه نمی‌دهد.',
  'agent.toolRequestPath': 'مسیر درخواست ابزار',
  'agent.unchangedGuarantees': 'تضمین‌های تغییرنکرده',
  // agentWorkspacePage ──────────────────────────────────────────
  'agentWorkspacePage.aNewConversationSaysSoAndWhatIt':
    'یک گفت‌وگوی تازه این را می‌گوید، و اینکه چه نشان خواهد داد: گزاره‌های برچسب‌دار واقعیت، تحلیل، فرضیه یا عدم‌قطعیت، هرکدام با منابعش.',
  'agentWorkspacePage.aTurnIsARoundTripWithA':
    'یک نوبت یک رفت‌وبرگشت با ارائه‌دهنده‌ای است که ممکن است کند باشد، و یک گفت‌وگو می‌تواند به‌سادگی تازه باشد. هر دو اینجا به‌عنوان همان کامپوننت‌های واقعی که نسخه متصل استفاده خواهد کرد نشان داده می‌شوند.',
  'agentWorkspacePage.addAnIntegration': 'افزودن یک یکپارچه‌سازی',
  'agentWorkspacePage.agentLifecycleState': 'وضعیت چرخه عمر عامل',
  'agentWorkspacePage.allowedTheDeterministicToolRunsAndItsResult':
    'مجاز: ابزار قطعی اجرا می‌شود و نتیجه‌اش با منشأ ثبت می‌شود.',
  'agentWorkspacePage.attachAFile': 'پیوست کردن فایل',
  'agentWorkspacePage.attachmentsAreNotPartOfThisBuild': 'پیوست‌ها بخشی از این ساخت نیستند.',
  'agentWorkspacePage.brokerExecutionDisabled': 'اجرای سفارش توسط کارگزار: غیرفعال',
  'agentWorkspacePage.budgetUsed': 'بودجه مصرف‌شده',
  'agentWorkspacePage.chainOfThoughtIsNeverDisplayedRequestedOrStored':
    'زنجیره فکر هرگز نمایش داده، درخواست یا ذخیره نمی‌شود — پاسخ یا یک خلاصه ساختاریافته است یا یک نوبت ناموفق.',
  'agentWorkspacePage.conversationWithTheTrainingAgentAnswersSeparateFact':
    'گفت‌وگو با عامل تمرینی. پاسخ‌ها واقعیت را از تحلیل، فرضیه و عدم‌قطعیت جدا می‌کنند و هر عدد از یک ابزار قطعی می‌آید.',
  'agentWorkspacePage.dataMarketDataWithAMandatoryProvenance':
    'داده — داده بازار با برچسب منشأ اجباری',
  'agentWorkspacePage.deniedTheRunIsBlockedWithAReason':
    'رد شد: اجرا با یک دلیل مسدود می‌شود و تلاش در رد حسابرسی دیدنی می‌ماند.',
  'agentWorkspacePage.fetchFromTheWeb': 'واکشی از وب',
  'agentWorkspacePage.historyRecentTurnsUnderATokenBudget':
    'تاریخچه — نوبت‌های اخیر زیر بودجه توکن',
  'agentWorkspacePage.ideaEvaluationHumanApproval': 'ایده → ارزیابی → تأیید انسانی',
  'agentWorkspacePage.instructionsVersionedNeverDropped': 'دستورها — دارای نسخه، هرگز حذف‌شده',
  'agentWorkspacePage.liveTradingDisabled': 'معامله زنده: غیرفعال',
  'agentWorkspacePage.memoryProvenanceRequiredUnverifiedLabelledUncertaint':
    'حافظه — منشأ الزامی، تأییدنشده به‌عنوان عدم‌قطعیت برچسب‌دار',
  'agentWorkspacePage.messageToTheTrainingAgent': 'پیام به عامل تمرینی',
  'agentWorkspacePage.modelAuthoredMemoryCanNeverBecomeTrustedKnowledge':
    'حافظه نوشته‌شده توسط مدل هرگز نمی‌تواند دانش مورد اعتماد شود',
  'agentWorkspacePage.modelOutputNeverBecomesActionDirectly':
    'خروجی مدل هرگز مستقیماً به کنش تبدیل نمی‌شود',
  'agentWorkspacePage.modelReturnsAToolCallRequestArgumentsOnly':
    'مدل یک درخواست فراخوانی ابزار برمی‌گرداند (فقط آرگومان‌ها).',
  'agentWorkspacePage.orchestratorChecksTheOperationAgainstThePermissionTa':
    'ارکستریتور عملیات را با جدول مجوز بررسی می‌کند.',
  'agentWorkspacePage.provider': 'ارائه‌دهنده',
  'agentWorkspacePage.requestsAreRefusedOnceTheMonthlyBudgetIs':
    'پس از مصرف بودجه ماهانه، درخواست‌ها رد می‌شوند.',
  'agentWorkspacePage.scriptedOfflineAdapterRemainsTheDeterministicDefault':
    'آداپتور اسکریپتی بی‌اتصال همچنان پیش‌فرض قطعی است.',
  'agentWorkspacePage.sendingIsDisabledNoProviderIsRegisteredAnd':
    'ارسال غیرفعال است: هیچ ارائه‌دهنده‌ای ثبت نشده و رابط نباید القای یک مدل کارکننده کند. عامل می‌تواند ابزارها را درخواست کند، اما فقط ارکستریتور پس از بررسی مجوز آن‌ها را اجرا می‌کند، و هر نتیجه با منشأ ثبت می‌شود.',
  'agentWorkspacePage.theAgentCallsDeterministicLocalToolsOnlyIt':
    'عامل فقط ابزارهای محلی قطعی را فراخوانی می‌کند. دسترسی به شبکه ندارد.',
  'agentWorkspacePage.theOrchestratorPermissionChecksAndToolRegistryAre':
    'ارکستریتور، بررسی‌های مجوز و رجیستری ابزارها ساخته شده‌اند، اما در این فاز هیچ ارائه‌دهنده میزبانی ثبت نشده، پس گفت‌وگوی زیر یک مثال ثابت است.',
  'agentWorkspacePage.theToolRegistryIsDeclaredInTheBackend':
    'رجیستری ابزارها در بک‌اند اعلام شده است. هیچ چیز در این صفحه نمی‌تواند گسترشش دهد.',
  'agentWorkspacePage.thisConversationHasNoTurnsYet': 'این گفت‌وگو هنوز نوبتی ندارد',
  'agentWorkspacePage.waitingForAStructuredAnswer': 'در انتظار پاسخی ساختاریافته',
  'agentWorkspacePage.whatTheAgentCannotDoWhateverItSays':
    'کارهایی که عامل نمی‌تواند انجام دهد، هر چه بگوید',
  'agentWorkspacePage.whatTheOrchestratorWouldAssemble': 'آنچه ارکستریتور مونتاژ می‌کند',
  'agentWorkspacePage.whileATurnIsInFlightTheAnswer':
    'تا زمانی که نوبتی در جریان است، ناحیه پاسخ شکل خود را نگه می‌دارد؛ هیچ جمله نیمه‌ای رندر نمی‌شود، چون ادعایی که نیمه راه رسیده می‌تواند تمام‌شده خوانده شود.',
  // analysisReadinessPanel ──────────────────────────────────────
  'analysisReadinessPanel.conflicting': 'متناقض',
  'analysisReadinessPanel.inputsConsidered': 'ورودی‌های در نظر گرفته‌شده',
  'analysisReadinessPanel.invalid': 'نامعتبر',
  'analysisReadinessPanel.noFindingsEveryInputThisAnalysisConsumesIs':
    'یافته‌ای نیست: هر ورودی‌ای که این تحلیل مصرف می‌کند موجود، خوش‌ساخت و به‌روز است.',
  'analysisReadinessPanel.outOfDate': 'کهنه',
  'analysisReadinessPanel.required': 'الزامی',
  'analysisReadinessPanel.satisfied': 'تأمین‌شده',
  // analyticsPanel ──────────────────────────────────────────────
  'analyticsPanel.aRisingCurveIsHistoryItIsA':
    'نمودار صعودی تاریخ است. سابقه‌ای از آنچه رخ داده، نه پیش‌بینی آنچه خواهد شد.',
  'analyticsPanel.consistentRiskIsWhatMakesAnRMultiple':
    'ریسک یکنواخت است که یک مضرب R را بین دو معامله قابل مقایسه می‌کند.',
  'analyticsPanel.drawdownIsMeasuredFromEveryHighWaterMarkSo':
    'افت سرمایه از هر بالاترین سطحی اندازه‌گیری می‌شود، پس یک سقف جدید آن را به صفر بازمی‌گرداند.',
  'analyticsPanel.equityPerTradeResultAndTheDistanceBelowThe':
    'ارزش حساب، نتیجه هر معامله و فاصله زیر بالاترین سطح.',
  'analyticsPanel.expectancyEarlyInASampleMovesForArithmetic':
    'انتظار در ابتدای یک نمونه به دلایل حسابی حرکت می‌کند، نه به دلایل راهبردی.',
  'analyticsPanel.highWaterMark': 'بالاترین سطح',
  'analyticsPanel.longAndShortKeptSeparateTheyAre':
    'خرید و فروش، جدا نگه داشته شده — آن‌ها نمونه‌های متفاوتی هستند.',
  'analyticsPanel.openAndIncompleteRecordsAreListedRatherThan':
    'سابقه‌های باز و ناتمام فهرست می‌شوند، نه حذف، پس ستون‌ها حساب هر سطر را دارند.',
  'analyticsPanel.outcomesSizeOfWinsAgainstSizeOfLosses':
    'نتایج، اندازه سودها در برابر اندازه زیان‌ها، و اینکه ریسک چقدر یکنواخت بوده است.',
  'analyticsPanel.plannedAgainstRealisedPerSetup':
    'برنامه‌ریزی‌شده در برابر محقق‌شده، برای هر ستاپ.',
  'analyticsPanel.theSessionASetupIsTakenInIs':
    'سشنی که یک ستاپ در آن گرفته می‌شود بخشی از شواهد آن ستاپ است.',
  'analyticsPanel.whatWasPlannedAgainstWhatTheRecordsRealised':
    'آنچه برنامه‌ریزی شده بود در برابر آنچه سابقه‌ها محقق کرده‌اند، بر حسب ستاپ.',
  'analyticsPanel.whereTheResultsCameFromSampleSizeIs':
    'اینکه نتایج از کجا آمده‌اند. حجم نمونه پیش از هر نرخی گزارش می‌شود.',
  // answerOption ────────────────────────────────────────────────
  'answerOption.correct': 'درست',
  'answerOption.incorrect': 'نادرست',
  'answerOption.partiallyCorrect': 'تا حدی درست',
  // backgroundTaskPanel ─────────────────────────────────────────
  'backgroundTaskPanel.active': 'فعال',
  'backgroundTaskPanel.all': 'همه',
  'backgroundTaskPanel.finished': 'پایان یافته',
  'backgroundTaskPanel.needsAttention': 'نیازمند توجه',
  // badge ───────────────────────────────────────────────────────
  'badge.historical': 'تاریخی',
  'badge.liveNotEnabled': 'زنده (فعال نشده)',
  // brand ───────────────────────────────────────────────────────
  'brand.masterTrade': 'Master Trade',
  // capabilities ────────────────────────────────────────────────
  'capabilities.howARequestIsHandled': 'یک درخواست چگونه پردازش می‌شود',
  'capabilities.ifItDoesNotPass': 'اگر از آن نگذرد:',
  'capabilities.modules': 'ماژول‌ها',
  'capabilities.provenanceRequirement': 'الزام منشأ',
  'capabilities.requiredBeforeAFigureExists': 'لازم پیش از آنکه عددی وجود داشته باشد',
  'capabilities.whatThisClaimsAndWhatIt': 'این چه چیزی را ادعا می‌کند و چه چیزی را نه',
  // capabilityPanels ────────────────────────────────────────────
  'capabilityPanels.availability': 'دسترس‌پذیری',
  'capabilityPanels.deterministicEngine': 'موتور قطعی',
  'capabilityPanels.memoryItMayCite': 'حافظه‌ای که می‌تواند به آن استناد کند',
  'capabilityPanels.meteredAs': 'اندازه‌گیری به‌صورت',
  'capabilityPanels.operationTheRoleTableDecides': 'عملیاتی که جدول نقش‌ها تعیین می‌کند',
  'capabilityPanels.outputs': 'خروجی‌ها',
  'capabilityPanels.theOrderTheServerAppliesAndWhatStops':
    'ترتیبی که سرور اعمال می‌کند و آنچه در هر مرحله یک درخواست را متوقف می‌کند. یک‌بار اعلام و سرو می‌شود، پس توضیح و رفتار نمی‌توانند از هم فاصله بگیرند.',
  'capabilityPanels.whatEachModuleContributesAndWhichCapabilitiesCompose':
    'سهم هر ماژول و اینکه کدام قابلیت‌ها آن را می‌سازند. رجیستری ماژولی را که هیچ قابلیتی از آن استفاده نکند رد می‌کند.',
  'capabilityPanels.whoMayAsk': 'چه کسی می‌تواند درخواست کند',
  // chartAdapter ────────────────────────────────────────────────
  'chartAdapter.anEmptyChartIsAFactAboutThe':
    'نمودار خالی واقعیتی درباره داده‌ها است، نه بازار بی‌حرکت.',
  'chartAdapter.nothingToPlotForThisSymbolAndTimeframe': 'چیزی برای رسم این نماد و تایم‌فریم نیست',
  'chartAdapter.theProviderReturnedNoBarsSoTheChart':
    'ارائه‌دهنده هیچ کندلی برنگرداند، بنابراین نمودار خالی می‌ماند و از یک سری جایگزین رسم نمی‌شود.',
  // charts ──────────────────────────────────────────────────────
  'charts.high': 'بیشینه',
  'charts.illustrativeRenderTheChartingLibraryIs':
    'نمایش نمونه — کتابخانهٔ نمودار در این مرحله نصب نشده است. آداپتور، تضمین‌های منشأ و فقط‌خواندنی بودن را یک‌جا نگه می‌دارد.',
  'charts.last': 'آخرین',
  'charts.low': 'کمینه',
  // clarifyingPrompts ───────────────────────────────────────────
  'clarifyingPrompts.everyRequiredFieldHasAValueYouGave':
    'هر فیلد الزامی مقداری دارد که خودتان داده‌اید، و هیچ‌کدام هنوز کهنه نشده است.',
  // client ──────────────────────────────────────────────────────
  'client.authenticating': 'در حال احراز هویت…',
  'client.disconnected': 'اتصال قطع شد.',
  'client.disconnectedReconnectToResumeTheEventStream':
    'اتصال قطع شد. برای ادامه جریان رویداد دوباره متصل شوید.',
  // concentrationRiskCard ───────────────────────────────────────
  'concentrationRiskCard.effectivePositions': 'پوزیشن‌های مؤثر',
  'concentrationRiskCard.fiveLargestCombined': 'پنج تای بزرگ‌تر با هم',
  'concentrationRiskCard.herfindahlHirschmanIndex01': 'شاخص هرفیندال–هیرشمن، 0–1',
  'concentrationRiskCard.largestSingle': 'بزرگ‌ترین تک',
  'concentrationRiskCard.positionsInSet': 'پوزیشن‌های موجود در مجموعه',
  'concentrationRiskCard.threeLargestCombined': 'سه تای بزرگ‌تر با هم',
  'concentrationRiskCard.topFive': 'پنج تای برتر',
  'concentrationRiskCard.topPosition': 'بزرگ‌ترین پوزیشن',
  'concentrationRiskCard.topThree': 'سه تای برتر',
  // connectionStatus ────────────────────────────────────────────
  'connectionStatus.authenticating': 'در حال احراز هویت',
  'connectionStatus.connecting': 'در حال اتصال',
  'connectionStatus.live': 'زنده',
  'connectionStatus.notConnected': 'متصل نیست',
  'connectionStatus.notPermitted': 'مجاز نیست',
  'connectionStatus.offline': 'بی‌اتصال',
  'connectionStatus.preparing': 'آماده‌سازی',
  'connectionStatus.reconnecting': 'اتصال دوباره',
  // dashboard ───────────────────────────────────────────────────
  'dashboard.aResultNeverActivatesARule': 'یک نتیجه هرگز خودبه‌خود قاعده‌ای را فعال نمی‌کند.',
  'dashboard.attempted': 'تلاش‌شده',
  'dashboard.attempts': 'تلاش',
  'dashboard.chartAdapter': 'آداپتور نمودار',
  'dashboard.complete': 'کامل ·',
  'dashboard.consistentReviewHabit11ConsecutiveDays':
    'عادت بازبینی پیوسته: ۱۱ روز پیاپی با نشست نوشته‌شده.',
  'dashboard.dashboardSections': 'بخش‌های داشبورد',
  'dashboard.emptyState': 'وضعیت خالی',
  'dashboard.examAverageDippedOnTheSecond': 'میانگین آزمون در دومین تلاش ماژول ریسک افت کرد.',
  'dashboard.examPerformance': 'عملکرد آزمون',
  'dashboard.growthIsNotMasteryUnverifiedRows':
    'رشد به‌معنای تسلط نیست: رکوردهای تأییدنشده هم شمرده می‌شوند.',
  'dashboard.knowledgeAssessmentAndResearch': 'دانش، ارزیابی و پژوهش',
  'dashboard.knowledgeMastery': 'تسلط بر دانش',
  'dashboard.loadingState': 'وضعیت بارگذاری',
  'dashboard.memoryGrowth': 'رشد حافظه',
  'dashboard.mock': 'نمونه',
  'dashboard.noSessionsRecordedYet': 'هنوز نشستی ثبت نشده است',
  'dashboard.oneJournalEntryMissingAnExplicit': 'یک ورودی دفتر معاملات فاقد سطح ابطال صریح است.',
  'dashboard.openExams': 'آزمون‌های باز',
  'dashboard.openHistory': 'تاریخچه را باز کن',
  'dashboard.openMemory': 'حافظه را باز کن',
  'dashboard.openResearch': 'پژوهش را باز کن',
  'dashboard.passedOf': 'قبول‌شده از',
  'dashboard.pending': 'در انتظار',
  'dashboard.previewData': 'دادهٔ پیش‌نمایش',
  'dashboard.previewGenerated': 'تولید پیش‌نمایش',
  'dashboard.recentAgentAndSystemEvents': 'رویدادهای تازهٔ دستیار و سامانه',
  'dashboard.recordsAddedInTheLastMonth': 'رکوردهای افزوده‌شده در ماه گذشته',
  'dashboard.recordsVerified': 'رکورد تأییدشده',
  'dashboard.researchProgress': 'پیشرفت پژوهش',
  'dashboard.riskFirstFramingAppearsInEvery':
    'چارچوب ریسک‌محور در هر ورودی دفتر معاملات این ماه دیده می‌شود.',
  'dashboard.rubricScoredNeverModelJudged': 'نمره‌گذاری با شیوه‌نامه، هرگز با داوری مدل.',
  'dashboard.running': 'در حال اجرا',
  'dashboard.scheduledEvaluationHasNotRun': 'ارزیابی زمان‌بندی‌شده اجرا نشده است',
  'dashboard.skeletonsAreUsedWhileAQuery':
    'اسکلت‌های بارگذاری تا زمانی که پرس‌وجویی در جریان است نمایش داده می‌شوند؛ تپش آن‌ها به prefers-reduced-motion احترام می‌گذارد.',
  'dashboard.strengths': 'نقاط قوت',
  'dashboard.theShapeOfTheActivityLog': 'ساختار گزارش فعالیت: شناسهٔ همبستگی، کنشگر، رویداد، شواهد',
  'dashboard.tradesEvaluated': 'معامله ارزیابی‌شده',
  'dashboard.trainingDashboard': 'داشبورد آموزش',
  'dashboard.trainingEquityCurve': 'منحنی سرمایهٔ آموزشی',
  'dashboard.verifiedMeansAHumanOrTool': 'تأییدشده یعنی انسان یا ابزاری آن را بررسی کرده است.',
  'dashboard.vsPrevious30Days': 'در مقابل ۳۰ روز پیش',
  'dashboard.watchList': 'فهرست پایش',
  // dashboardPage ───────────────────────────────────────────────
  'dashboardPage.completedLessonsAndGradedExamsWillAppearHere':
    'درس‌های کامل‌شده و آزمون‌های تصحیح‌شده به‌محض اضافه شدن بخش ماندگارسازی اینجا ظاهر می‌شوند.',
  'dashboardPage.emptyIsAValidStateItIs': 'خالی یک حالت معتبر است — گفته می‌شود، پنهان نمی‌شود.',
  'dashboardPage.overview': 'نمای کلی',
  'dashboardPage.progressStudyMetricsAndReadOnlyChartsEveryFigure':
    'پیشرفت، معیارهای مطالعه و نمودارهای فقط‌خواندنی. هر رقم زیر، داده پیش‌نمایش نمونه‌وار است که بر اساس مدل‌های نمای بک‌اند تایپ شده.',
  'dashboardPage.reloadsTheLayoutSkeletonNoJobIsQueued':
    'اسکلت چیدمان را دوباره بارگذاری می‌کند. در این فاز هیچ کاری در صف قرار نمی‌گیرد.',
  'dashboardPage.rollUpsFromTheProductModulesEachFigureIs':
    'تجمیع‌ها از ماژول‌های محصول. هر رقم نمونه‌وار است و هر کارت می‌گوید چه چیزی را نمی‌تواند به شما بگوید.',
  'dashboardPage.stateExamples': 'نمونه‌های حالت',
  'dashboardPage.theEvaluationHarnessIsInPlaceTheScheduler':
    'بستر ارزیابی آماده است؛ زمان‌بندی که آن را در صف می‌گذارد همراه با صف کارهای ماندگار می‌آید.',
  'dashboardPage.thisDashboardIsNotConnectedToTheBackend':
    'این داشبورد به بک‌اند متصل نیست. پیشرفت، معیارها و نمودارها نمونه‌وارند و بر اساس مدل‌های نمای نهایی تایپ شده‌اند.',
  // data ────────────────────────────────────────────────────────
  'data.aWrittenEvidenceBackedProcessOfYourOwn': 'فرایند نوشته‌شده و شواهدمحور از خودتان.',
  'data.acrossTheSixMonthCurriculum': 'در طول دوره شش‌ماهه',
  'data.anthropic': 'Anthropic',
  'data.chartReading': 'خواندن نمودار',
  'data.consecutiveDaysWithACompletedReviewSession': 'روزهای پیاپی با یک نشست بازبینی کامل‌شده',
  'data.contextAssembly': 'مونتاژ بافت',
  'data.deterministicDefaultUsedWhenNoHostedProviderIs':
    'پیش‌فرض قطعی که وقتی هیچ ارائه‌دهنده میزبانی تنظیم نشده استفاده می‌شود.',
  'data.draftKeptAsACounterExampleTheReasonTo':
    'پیش‌نویس. به‌عنوان نمونه‌ای نقض‌کننده نگه داشته شد: دلیل کنار گذاشتن یک معامله هم سابقه‌ای است.',
  'data.drawdownControl': 'کنترل افت سرمایه',
  'data.drawdownYouCanActuallySurvive': 'افتی که واقعاً می‌توانید از آن جان سالم به‌در ببرید',
  'data.epistemic.analysis': 'تحلیل',
  'data.epistemic.fact': 'واقعیت',
  'data.epistemic.hypothesis': 'فرضیه',
  'data.epistemic.uncertainty': 'عدم‌قطعیت',
  'data.examAverageDippedBelow80InTheLast': 'میانگین آزمون در آخرین تلاش زیر 80% افت کرد.',
  'data.examGrading': 'تصحیح آزمون',
  'data.executionDiscipline': 'نظم در اجرا',
  'data.expectancy': 'انتظار',
  'data.expectancySampleSizeAndWhySmallSamplesLie':
    'انتظار، حجم نمونه و اینکه چرا نمونه‌های کوچک دروغ می‌گویند.',
  'data.fixedFractionalSizing': 'اندازه‌گذاری کسری ثابت',
  'data.humanApprovedChanges': 'تغییرات تأییدشده توسط انسان',
  'data.hypothesisTradersWhoFixRiskFirstTendTo':
    'فرضیه: معامله‌گرانی که ابتدا ریسک را تثبیت می‌کنند بعدها خستگی تصمیم کمتری دارند. این ادعایی آزمون‌پذیر درباره فرایند شماست، نه پیش‌بینی بازار، و باید پیش از اعتماد به آن در دفتر معاملات خودتان بررسی شود.',
  'data.independentOperator': 'اپراتور مستقل',
  'data.invalidationLevelWrittenDown': 'سطح ابطال نوشته شد',
  'data.journalEntries': 'نوشته‌های دفتر معاملات',
  'data.journaling': 'یادداشت‌نویسی',
  'data.keysAreStoredInTheOSKeychainConfiguration':
    'کلیدها در مدار کلید سیستم‌عامل ذخیره می‌شوند؛ تنظیمات همیشه فقط یک ارجاع نگه می‌دارد.',
  'data.marketMechanicsVocabulary': 'مکانیک بازار و واژگان',
  'data.meanOfYourBestScorePerExamination': 'میانگین بهترین امتیاز شما در هر آزمون',
  'data.mockDataNotice':
    'دادهٔ نمونه برای بررسی چیدمان. هیچ‌چیز در این صفحه به بک‌اند، مدل یا خوراک بازار متصل نیست.',
  'data.module2AvailableAfterModule1Completion': 'ماژول 2 پس از تکمیل ماژول 1 در دسترس است',
  'data.module2UnlockedRiskFirst': 'ماژول 2 باز شد: اول ریسک.',
  'data.openAI': 'OpenAI',
  'data.orderTypesTheoryOnly': 'انواع سفارش (فقط نظری)',
  'data.ordersSpreadsSessionsAndTheLanguageOfPrice': 'سفارش‌ها، اسپردها، سشن‌ها و زبان قیمت.',
  'data.outOfSampleCaution': 'احتیاط نمونه بیرون‌زده',
  'data.positionSizeFromDeterministicTool': 'اندازه پوزیشن از ابزار قطعی',
  'data.positionSizingRMultiplesAndSurvivableLoss': 'اندازه پوزیشن، مضرب‌های R و زیان قابل تحمل.',
  'data.postEarningsGapContinuation': 'ادامه گپ پس از گزارش درآمد',
  'data.postTradeReview': 'بازبینی پس از معامله',
  'data.preTradeChecklist': 'چک‌لیست پیش از معامله',
  'data.processJournalingAndReviewInsteadOfPrediction':
    'فرایند، یادداشت‌نویسی و بازبینی به‌جای پیش‌بینی.',
  'data.pullbackToPriorSupportRiskDefined': 'بازگشت به حمایت پیشین، ریسک تعیین‌شده',
  'data.rMultiples': 'مضرب‌های R',
  'data.rangeEdgeLowConviction': 'لبه رنج، اطمینان پایین',
  'data.responseLabelledWithFactAnalysisHypothesis':
    'پاسخ با برچسب واقعیت / تحلیل / فرضیه / عدم‌قطعیت',
  'data.reviewStreak': 'رشته بازبینی',
  'data.reviewedAgainstTheMonth2ChecklistProcessNotes':
    'بر اساس چک‌لیست ماه 2 بازبینی شد. فقط یادداشت فرایند — هیچ نتیجه‌ای ادعا نشده.',
  'data.riskDefinedBeforeEntry': 'ریسک پیش از ورود تعیین شد',
  'data.riskFirst': 'اول ریسک',
  'data.riskPositionSizeNotYetConnected': 'risk.positionSize (هنوز متصل نشده)',
  'data.riskPositionSizeRequestedPermissionCheckAndExecution':
    'risk.positionSize درخواست شد — بررسی مجوز و اجرا در اختیار ارکستریتور است',
  'data.riskToolUsage': 'استفاده از ابزارهای ریسک',
  'data.scriptedOffline': 'اسکریپتی (بی‌اتصال)',
  'data.secondProviderExistsToProveTheGatewayIs':
    'ارائه‌دهنده دوم وجود دارد تا ثابت کند درگاه مستقل از ارائه‌دهنده است.',
  'data.sessions': 'سشن‌ها',
  'data.statisticsOfOutcomes': 'آمار نتایج',
  'data.streaksAndConsistency': 'رشته‌های برد و یکنواختی',
  'data.structureLevelsAndContextBeforePatternNames': 'ساختار، سطوح و بافت پیش از نام الگوها.',
  'data.supportResistance': 'حمایت و مقاومت',
  'data.thinkingInRInsteadOfCurrency': 'اندیشیدن بر حسب R به‌جای ارز',
  'data.trendStructure': 'ساختار روند',
  'data.uncertaintyNothingHereTellsYouWhetherThisSetup':
    'عدم‌قطعیت: هیچ چیز اینجا نمی‌گوید این ستاپ جواب می‌دهد یا نه. حجم نمونه یک است و یک نتیجه واحد وزن آماری ندارد.',
  'data.volumeContext': 'بافت حجم',
  'data.waitingForReviewElevatedVolatilityMeansWiderStops':
    'در انتظار بازبینی. نوسان بالا یعنی حد ضررهای بازتر و حجم کوچک‌تر.',
  'data.writtenPlan': 'طرح نوشته‌شده',
  'data.writtenReviewsNotPredictions': 'بازبینی‌های نوشته‌شده، نه پیش‌بینی‌ها',
  // dataQualityBadge ────────────────────────────────────────────
  'dataQualityBadge.absent': 'غایب',
  'dataQualityBadge.computedFromValuesYouGaveByDeterministicCode':
    'از مقادیر داده‌شده توسط شما محاسبه شده، با کد قطعی و نه با مدل.',
  'dataQualityBadge.insideTheFreshnessWindowForThisKindOf': 'داخل پنجره تازگی برای این نوع ورودی.',
  'dataQualityBadge.itWasUsableAndHasAgedPastThe':
    'قابل استفاده بود و از پنجره این نوع ورودی کهنه شده است.',
  'dataQualityBadge.noObservationTimeSoItCannotBeAssessed':
    'زمان مشاهده ندارد، پس نمی‌توان تازگی آن را سنجید و به‌عنوان فرض تلقی می‌شود.',
  'dataQualityBadge.notAUsableValueOfItsDeclaredKind':
    'مقدار قابل استفاده‌ای از نوع اعلام‌شده‌اش نیست، پس باید تصحیح شود.',
  'dataQualityBadge.notProvidedItIsNeverTreatedAsA':
    'ارائه نشده. هرگز به‌عنوان واقعیت تلقی نمی‌شود و هرگز پیش‌پر نمی‌شود.',
  'dataQualityBadge.nothingIsStoredForThisInput': 'برای این ورودی چیزی ذخیره نشده است.',
  'dataQualityBadge.nothingIsStoredForThisInputAndAn':
    'برای این ورودی چیزی ذخیره نشده و تحلیلی که به آن نیاز دارد نمی‌تواند اجرا شود.',
  'dataQualityBadge.nothingWasPresentToCheck': 'چیزی برای بررسی موجود نبود.',
  'dataQualityBadge.presentButItsProvenanceIsNotRecordedWell':
    'موجود است، اما منشأ آن به‌قدر کافی ثبت نشده تا بتوان وزنش داد.',
  'dataQualityBadge.theValueIsAWellFormedValueOfIts':
    'مقدار، مقداری خوش‌ساخت از نوع اعلام‌شده‌اش است.',
  'dataQualityBadge.thisBuildDoesNotKnowThisTokenSo':
    'این ساخت این توکن را نمی‌شناسد، پس دقیقاً همان‌گونه که فرستاده شده نمایش داده می‌شود.',
  'dataQualityBadge.unchecked': 'بررسی‌نشده',
  'dataQualityBadge.undated': 'بدون تاریخ',
  'dataQualityBadge.valid': 'معتبر',
  'dataQualityBadge.youGaveThisValueAndItIsInside':
    'این مقدار را خودتان داده‌اید و داخل پنجره تازگی آن است.',
  // decisions ───────────────────────────────────────────────────
  'decisions.actual': 'واقعی',
  'decisions.appendOnlyEachRowNamesThe':
    'فقط‌افزودنی. هر سطر قاعده‌ای را نام می‌برد که آن حکم را ساخته و نسخه‌ای را که خوانده است؛ خود عددها هر بار که نمایش داده می‌شوند دوباره محاسبه می‌شوند.',
  'decisions.assumptionsThisReadingRestsOn': 'فرض‌هایی که این خوانش بر آن‌ها استوار است',
  'decisions.confidence.assumed': 'فرض‌شده',
  'decisions.confidence.confirmed': 'تأییدشده',
  'decisions.confidence.derived': 'استخراج‌شده',
  'decisions.confidence.missing': 'ناموجود',
  'decisions.difference': 'تفاوت',
  'decisions.evaluationHistory': 'تاریخچهٔ ارزیابی',
  'decisions.evaluationReadiness': 'آمادگی برای ارزیابی',
  'decisions.expected': 'انتظار',
  'decisions.expectedVersusActual': 'انتظار در مقابل واقعیت',
  'decisions.keptInTheFlowOfThe':
    'در جریان خود عددها نگه داشته می‌شود و کنار گذاشته نمی‌شود: عددی که بدون این‌ها خوانده شود، عدد دیگری است.',
  'decisions.limitationsAndAssumptions': 'محدودیت‌ها و فرض‌ها',
  'decisions.noFigureExistsForThisRecord':
    'برای این رکورد عددی وجود ندارد، و دلیل‌ها در ادامه فهرست می‌شوند نه اینکه صفر نشان داده شوند.',
  'decisions.noFindingsTheRecordIsComplete':
    'موردی یافت نشد. رکورد به‌قدر کافی کامل است که سنجیده شود، و بازه همان است که خودش اعلام می‌کند.',
  'decisions.notAResult': '— نتیجه نیست',
  'decisions.notEvaluated': 'ارزیابی‌نشده',
  'decisions.notEvaluatedYet': 'هنوز ارزیابی نشده است',
  'decisions.observations': 'مشاهدات',
  'decisions.outcome': 'پیامد',
  'decisions.readiness': 'آمادگی',
  'decisions.reason': 'دلیل',
  'decisions.recorded': '· ثبت‌شده',
  'decisions.reportedForTheReturnOnly': 'تنها برای بازده گزارش شده است',
  'decisions.theRecordItself': 'خود رکورد',
  'decisions.v': 'v',
  'decisions.version': 'نسخه',
  'decisions.whatTheRecordSaysHappened': 'آنچه رکورد می‌گوید رخ داده است',
  'decisions.whatWouldChangeTheAnswer': 'چه چیزی پاسخ را تغییر می‌دهد',
  'decisions.whatYouSaidYouExpectedAnd':
    'آنچه گفتید انتظار داشتید، و آنچه رکورد می‌گوید رخ داده است. این مقایسه تنها وقتی انجام می‌شود که هر دو سو موجود باشند و سوئ واقعی یک پیامد واقعی باشد.',
  'decisions.when': 'زمان',
  'decisions.window': 'بازه',
  'decisions.yourDeclaredContext': 'زمینهٔ اعلام‌شدهٔ شما',
  'decisions.yourRationaleAsYouRecordedIt': 'استدلال شما، همان‌طور که ثبت کردید',
  // evaluation ──────────────────────────────────────────────────
  'evaluation.aRequestNamingACapabilityNobody':
    'درخواستی که قابلیتی را نام ببرد که هیچ‌کس اعلام نکرده است، در مرحلهٔ تفکیک رد می‌شود، پیش از آنکه ورودی‌ای خوانده شود — قابلیت‌ها به‌طور پیش‌فرض مجاز نیستند، پس شناسهٔ اعلام‌نشده پیاده‌سازی‌ای برای رسیدن ندارد.',
  'evaluation.capabilities': 'قابلیت‌ها',
  'evaluation.couldNotReadTheCapabilityCatalogue': 'فهرست قابلیت‌ها خوانده نشد',
  'evaluation.couldNotReadTheDecision': 'تصمیم خوانده نشد',
  'evaluation.couldNotReadYourDecisions': 'تصمیم‌های شما خوانده نشد',
  'evaluation.decidedBy': '· تصمیم‌گیرنده',
  'evaluation.declared': 'اعلام‌شده ·',
  'evaluation.description':
    'آنچه تصمیم گرفتید را ثبت کنید، ببینید قیمت‌های ثبت‌شده چه می‌گویند رخ داده است — و چه چیزی سنجیده نشده — و بخوانید که این سامانه ادعا می‌کند با آن چه می‌تواند بکند و چه نمی‌تواند. هیچ‌چیز اینجا پیش‌بینی نمی‌شود و هیچ تصمیمی نمره نمی‌گیرد.',
  'evaluation.eachStateIsComputedOnThe':
    'هر وضعیت روی سرور و از اعلام‌های خودتان و از آنچه قابلیت می‌گوید نیاز دارد محاسبه می‌شود. دسترس‌پذیری و آمادگی دو ادعای جدا هستند، پس قابلیتی که ساخته نشده است همین را می‌گوید، به‌جای آنکه ورودی‌هایی بخواهد که نمی‌تواند از آن‌ها استفاده کند.',
  'evaluation.evaluationRecorded': 'ارزیابی ثبت شد',
  'evaluation.evaluationSections': 'بخش‌های ارزیابی',
  'evaluation.inputs': 'ورودی‌ها:',
  'evaluation.modules': 'ماژول',
  'evaluation.noCapabilityCatalogueToShow': 'فهرست قابلیتی برای نمایش وجود ندارد',
  'evaluation.noCapabilityHerePlacesAnOrder':
    'هیچ قابلیتی در اینجا سفارش نمی‌گذارد، به کارگزار وصل نمی‌شود و زنده اجرا نمی‌شود. برای آن عملیاتی وجود ندارد، هیچ طرحی آن را دربر نمی‌گیرد و موتور هیچ ابزاری پشت آن ندارد.',
  'evaluation.noDecisionsToShow': 'تصمیمی برای نمایش وجود ندارد',
  'evaluation.notEvaluatedTheReasonsAreBelow': 'ارزیابی‌نشده — دلیل‌ها در ادامه آمده است',
  'evaluation.readinessPerAnalysis': 'آمادگی به‌ازای هر تحلیل',
  'evaluation.refresh': 'تازه‌سازی',
  'evaluation.refreshTheDecisionList': 'تازه‌سازی فهرست تصمیم‌ها',
  'evaluation.selectADecision': 'یک تصمیم انتخاب کنید',
  'evaluation.whatIsDeliberatelyAbsent': 'آنچه آگاهانه غایب است',
  'evaluation.whatThisAccountCanDoRight': 'این حساب در همین لحظه چه کاری می‌تواند بکند',
  // evaluationPage ──────────────────────────────────────────────
  'evaluationPage.aDecisionIsARecordOfYourReasoning':
    'یک تصمیم سابقه‌ای از استدلال شماست، نه یک سفارش معامله. هیچ چیز در این صفحه نمی‌تواند یکی ثبت کند.',
  'evaluationPage.decisions': 'تصمیم‌ها',
  'evaluationPage.decisionsAreRecordedThroughTheAPIWithThe':
    'تصمیم‌ها از طریق API با قیمت‌ها، ریسکی که برنامه‌ریزی کرده‌اید و آنچه انتظار داشته‌اید ثبت می‌شوند. وقتی یکی وجود داشته باشد، این صفحه می‌سنجد که قیمت‌های خودش چه اتفاقی را نشان می‌دهند.',
  'evaluationPage.eachOneDeclaresTheInputsItIsGated':
    'هر یک ورودی‌هایی که به آن‌ها گره خورده، عملیاتی که جدول نقش‌ها تعیین می‌کند، موتوری که ارقامش را محاسبه می‌کند و آنچه ادعا می‌کند — از جمله آنچه ادعا نمی‌کند — را اعلام می‌کند.',
  'evaluationPage.itsRecordTheReadinessVerdictFromBothGates':
    'سابقه‌اش، داوری آمادگی از هر دو دروازه، و ارزیابی محاسبه‌شده از قیمت‌های روی سابقه.',
  'evaluationPage.theGateSVerdictForEveryDeclaredAnalysisType':
    'داوری دروازه برای هر نوع تحلیل اعلام‌شده، از بافت خود شما. هیچ چیز اینجا توسط مدل تعیین نمی‌شود.',
  // evaluationPanels ────────────────────────────────────────────
  'evaluationPanels.askingForAnEvaluationAppendsARowHere':
    'درخواست ارزیابی یک سطر اینجا اضافه می‌کند. چیزی بازنویسی نمی‌شود، پس یک رقم تغییر‌یافته با دو سطر توضیح داده می‌شود، نه با سطری که ویرایش شده است.',
  'evaluationPanels.currency': 'ارز',
  'evaluationPanels.eachEvaluationThisDecisionHasHadWithThe':
    'هر ارزیابی‌ای که این تصمیم داشته است، همراه با قاعده‌ای که آن را تولید کرده',
  'evaluationPanels.entry': 'ورود',
  'evaluationPanels.exit': 'خروج',
  'evaluationPanels.expectedR': 'R انتظاری',
  'evaluationPanels.expectedReturn': 'بازده انتظاری',
  'evaluationPanels.notMeasurable': 'قابل اندازه‌گیری نیست',
  'evaluationPanels.notStated': 'ثبت نشده',
  'evaluationPanels.plannedRisk': 'ریسک برنامه‌ریزی‌شده',
  'evaluationPanels.rMultiple': 'مضرب R',
  'evaluationPanels.readingsTheEngineDerivedEachWithTheMetrics':
    'خوانش‌هایی که موتور استخراج کرده، هر یک با معیارهایی که بر آن‌ها استوار است و آنچه پوشش نمی‌دهد.',
  'evaluationPanels.return': 'بازده',
  'evaluationPanels.windowCloses': 'زمان بسته شدن پنجره',
  'evaluationPanels.windowOpens': 'زمان باز شدن پنجره',
  // examCard ────────────────────────────────────────────────────
  'examCard.attemptProgress': 'پیشرفت تلاش',
  'examCard.noExamServiceIsConnectedInThisPhase':
    'در این فاز هیچ سرویس آزمونی متصل نیست، پس این کنش بی‌اثر است.',
  // exams ───────────────────────────────────────────────────────
  'exams.aHighWinRateWithNegativeExpectancyStill':
    'نرخ برد بالا با انتظار منفی همچنان پول می‌بازد؛ روبریک خودِ تفکیک را نمره می‌دهد، نه محاسبه را.',
  'exams.aMeanAcrossDifferentExamsIs':
    'میانگین بین آزمون‌های متفاوت یک نشانهٔ مطالعاتی است، نه نمره.',
  'exams.aRiskBudgetIsDefinedInCurrencyBefore':
    'بودجه ریسک پیش از در نظر گرفتن ورود، به ارز تعیین می‌شود. بودجه نخست چه چیزی را تعیین می‌کند؟',
  'exams.aStopInsideTheNoiseRangeIsA':
    'حد ضرری داخل محدوده نوسان، تصمیمی برای متوقف شدن است، نه محدودیت ریسک.',
  'exams.abandonedPartWayThroughABlankIs':
    'نیمه‌کاره رها شد — یک خالی به‌عنوان بی‌اعتبار ثبت می‌شود، هرگز به‌عنوان صفر.',
  'exams.acrossAttempts': 'در میان تلاش‌ها',
  'exams.action.available': 'شروع ارزیابی',
  'exams.action.completed': 'بازبینی پاسخ‌ها',
  'exams.action.failed': 'تلاش دوباره',
  'exams.action.in-progress': 'ادامهٔ تلاش',
  'exams.action.locked': 'قفل‌شده',
  'exams.assessmentProgress': 'پیشرفت ارزیابی',
  'exams.assessmentStates': 'وضعیت‌های ارزیابی',
  'exams.attempt': '· تلاش',
  'exams.attemptContext': 'زمینهٔ تلاش',
  'exams.attemptHistory': 'تاریخچهٔ تلاش‌ها',
  'exams.attempted': 'تلاش‌شده ·',
  'exams.attemptsRecorded': 'تلاش ثبت‌شده',
  'exams.attemptsToPass': 'تلاش‌های لازم برای قبولی',
  'exams.availableNow': 'اکنون در دسترس',
  'exams.averageBestScore': 'میانگین بهترین نمره',
  'exams.averageBestScore2': 'میانگین بهترین نمره',
  'exams.best': 'بهترین',
  'exams.bestScore': 'بهترین نمره',
  'exams.byEvidence': 'بر پایهٔ شواهد',
  'exams.byLesson': 'بر پایهٔ درس',
  'exams.byPattern': 'بر پایهٔ الگو',
  'exams.closestAttemptSoFarGapsAreConcentrationNot':
    'نزدیک‌ترین تلاش تاکنون؛ شکاف‌ها در تمرکز است، نه در خطای خام.',
  'exams.confusingExpectancyWithWinRate': 'اشتباه گرفتن انتظار با نرخ برد',
  'exams.currentAssessment': 'ارزیابی جاری',
  'exams.empty': 'خالی',
  'exams.enforcedServerSide': 'روی سرور اعمال می‌شود',
  'exams.error': 'خطا',
  'exams.everyAttemptIsRetainedIncludingThe':
    'هر تلاش نگه داشته می‌شود، از جمله تلاش‌هایی که بی‌اعتبار شدند',
  'exams.everyPatternPointsBackToThe':
    'هر الگو به درسی برمی‌گردد که آن را آموزش می‌دهد، پس بازبینی جایی برای رفتن دارد.',
  'exams.exam': 'آزمون',
  'exams.examCategories': 'دسته‌های آزمون',
  'exams.examGradingPolicy':
    'نمره‌گذاری بر پایهٔ شیوه‌نامه و قطعی است: بک‌اند هر پاسخ را با شیوه‌نامه می‌سنجد و مدل تنها توضیح می‌دهد. قبولی یا ردی هرگز نظر مدل نیست.',
  'exams.examIntegrityPolicy':
    'کلید پاسخ هرگز پیش از ارسال به کارخواه نمی‌رسد. پرسش‌های زیر تنها شکل‌اند: همه به‌عنوان نگه‌داشته‌شده علامت خورده‌اند.',
  'exams.examPreviewNotice':
    'دادهٔ ارزیابی نمونه. در این مرحله هیچ موتور اجرای آزمون، نمره‌گذار یا کلید پاسخی متصل نیست — نمره‌های نمایش‌داده‌شده نمونهٔ چیدمان‌اند، نه نتیجه.',
  'exams.examState.available': 'در دسترس',
  'exams.examState.completed': 'کامل‌شده',
  'exams.examState.failed': 'ردشده',
  'exams.examState.in-progress': 'در جریان',
  'exams.examState.locked': 'قفل‌شده',
  'exams.examinationSections': 'بخش‌های آزمون',
  'exams.examinations': 'آزمون‌ها',
  'exams.example': 'مثال',
  'exams.exams': 'آزمون‌ها',
  'exams.executionDiscipline': 'نظم در اجرا',
  'exams.expectancyAndTheSmallSampleTrap': 'انتظار و تله نمونه کوچک',
  'exams.expectancySampleSizeOutOfSampleCaution': 'انتظار، حجم نمونه، احتیاط نمونه بیرون‌زده',
  'exams.firstAttemptSizingQuestionsAnsweredInCurrencyRather':
    'تلاش نخست؛ پرسش‌های اندازه‌گذاری به ارز پاسخ داده شد، نه بر حسب R.',
  'exams.fixedFractionalPositionSizing': 'حجم‌گذاری کسری ثابت',
  'exams.gradedAgainst': 'سنجیده‌شده با',
  'exams.gradingJobHasNotRun': 'کار نمره‌گذاری اجرا نشده است',
  'exams.howAGradedAnswerIsDisplayed':
    'نمایش یک پاسخ نمره‌خورده، پس از آنکه سرور حکم‌ها را برگرداند',
  'exams.howSessionOverlapChangesWhatAFillActually':
    'چگونه هم‌پوشانی سشن‌ها هزینه واقعی یک پر شدن را تغییر می‌دهد.',
  'exams.improvedStillBelowThePassScore': 'بهتر شد، اما همچنان زیر نمره قبولی.',
  'exams.inOneParagraphExplainWhyA12TradeWinning':
    'در یک بند توضیح دهید چرا رشته 12 برد پیاپی شاهدی بر یک مزیت نیست.',
  'exams.integrityRules': 'قواعد صحت آزمون',
  'exams.isComplete': 'کامل است.',
  'exams.itMakesTwoDifferentSymbolsComparable': 'دو نماد متفاوت را قابل مقایسه می‌کند',
  'exams.itRemovesTheNeedForAStop': 'نیاز به حد ضرر را حذف می‌کند',
  'exams.itSeparatesDecisionQualityFromPositionSize': 'کیفیت تصمیم را از اندازه پوزیشن جدا می‌کند',
  'exams.keyWithheld': 'کلید نگه‌داشته‌شده',
  'exams.kind.multi-choice': 'چندگزینه‌ای',
  'exams.kind.numeric': 'عددی',
  'exams.kind.single-choice': 'تک‌گزینه‌ای',
  'exams.kind.written': 'تشریحی',
  'exams.lastSeen': '· آخرین مشاهده',
  'exams.loading': 'در حال بارگذاری',
  'exams.locked': 'قفل‌شده',
  'exams.lockedByPrerequisiteWithTheDependency':
    'قفل‌شده بر پایهٔ پیش‌نیاز، با نام بردن از وابستگی',
  'exams.lockedExaminations': 'آزمون‌های قفل‌شده',
  'exams.m': 'دقیقه',
  'exams.m2': 'دقیقه ·',
  'exams.meanAcrossPassedExaminations': 'میانگین بین آزمون‌های قبول‌شده',
  'exams.meanOfGradedAttempts': 'میانگین تلاش‌های نمره‌خورده',
  'exams.meanOfTheBestScorePer': 'میانگین بهترین نمره در هر آزمون',
  'exams.misses': 'خطاها ·',
  'exams.mistakeAnalysis': 'تحلیل اشتباه‌ها',
  'exams.mistakesAreGroupedByTheRule':
    'اشتباه‌ها بر پایهٔ قاعده‌ای که نقض شده گروه‌بندی می‌شوند، نه بر پایهٔ پرسشی که در آن رخ داده‌اند.',
  'exams.nextQuestion': 'پرسش بعدی',
  'exams.noAttemptsInThisCategory': 'در این دسته تلاشی وجود ندارد',
  'exams.normalisingOutcomesSoTheyCanBeComparedAcross':
    'یکسان‌سازی نتایج تا بتوان آن‌ها را میان نمادها مقایسه کرد.',
  'exams.notAStoredHistory': 'تاریخچهٔ ذخیره‌شده نیست',
  'exams.nothingMissedYet': 'هنوز چیزی از دست نرفته است',
  'exams.nothingOnThisScreenGradesStores':
    'هیچ‌چیز در این صفحه پاسخی را نمره نمی‌زند، ذخیره نمی‌کند یا نمی‌فرستد.',
  'exams.of': 'از',
  'exams.ofMisses': 'از خطاها',
  'exams.openReviewPlan': 'باز کردن برنامهٔ مرور',
  'exams.partialCreditIsExpressedPerRubric':
    'نمرهٔ جزئی به‌ازای هر معیار شیوه‌نامه بیان می‌شود، پس یک پاسخ تشریحی می‌تواند نیمه‌درست علامت بخورد، به‌جای همه‌یا‌هیچ.',
  'exams.passAt': 'حد قبولی',
  'exams.passAt2': '· حد قبولی',
  'exams.passed': 'قبول‌شده ·',
  'exams.passedAfterReworkingTheSizingLesson': 'پس از بازکار درس اندازه‌گذاری قبول شد.',
  'exams.passedOnTheFirstAttempt': 'در تلاش نخست قبول شد.',
  'exams.patternsComeFromStoredAttemptResults':
    'الگوها از نتایج ذخیره‌شدهٔ تلاش‌ها می‌آیند، هرگز از خلاصهٔ یک مدل.',
  'exams.placingTheInvalidationLevelInsideNormalNoise': 'قرار دادن سطح ابطال داخل نوسان عادی',
  'exams.pointsBackTo': 'برمی‌گردد به',
  'exams.postSubmissionReview': 'بازبینی پس از ارسال',
  'exams.previewAssessmentData': 'دادهٔ ارزیابی پیش‌نمایش',
  'exams.previous': 'پیشین',
  'exams.processJournalingReview': 'فرایند، یادداشت‌نویسی، بازبینی',
  'exams.processOmissionRatherThanAKnowledgeGapThe':
    'حذف فرایندی، نه شکاف دانشی: پاسخ چک‌لیست درست بود، تمرین دفتر معاملات نه.',
  'exams.processReview': 'بازبینی فرایند',
  'exams.question': 'پرسش',
  'exams.questions': 'پرسش‌ها',
  'exams.requires': 'نیازمند',
  'exams.resumeAttempt': 'ادامهٔ تلاش',
  'exams.retriesAreKeptAFailedAttempt':
    'تلاش‌های دوباره نگه داشته می‌شوند. تلاش ردشده شاهدی است بر اینکه کدام درس باید بازخوانی شود، نه یک جریمه.',
  'exams.review': 'بازبینی',
  'exams.reviewDisciplineAfterALoss': 'نظم بازبینی پس از یک زیان',
  'exams.riskPerTradeBeforeRewardPer': 'ریسک هر معامله پیش از بازده هر معامله',
  'exams.roundingAUnitCountUpInsteadOfDown': 'گرد کردن تعداد واحد به بالا به‌جای پایین',
  'exams.roundingDirectionWrongInFourOfFiveSizing':
    'جهت گرد کردن در چهار پرسش از پنج پرسش اندازه‌گذاری غلط بود.',
  'exams.roundingUpSilentlyExceedsTheStatedRiskBudget':
    'گرد کردن به بالا بی‌صدا از بودجه ریسک اعلام‌شده فراتر می‌رود — خطا در اندازه است، نه در پاسخ.',
  'exams.separatingABadOutcomeFromABadDecision': 'جدا کردن نتیجه بد از تصمیم بد.',
  'exams.serverGraded': 'نمره‌خورده روی سرور',
  'exams.sessionsLevelsContextBeforePatterns': 'سشن‌ها، سطوح، بافت پیش از الگوها',
  'exams.sessionsSpreadsAndTheCostOfImpatience': 'سشن‌ها، اسپردها و هزینه بی‌صبری',
  'exams.sharesAreComputedAgainstTheNumber':
    'سهم‌ها در برابر شمار پاسخ‌های نادرست محاسبه می‌شوند، پس مخرج هرگز پنهان نمی‌ماند.',
  'exams.sizingRMultiplesSurvivableLoss': 'اندازه‌گذاری، مضرب‌های R، زیان قابل تحمل',
  'exams.skeletonsWhileAnAttemptIsFetched':
    'اسکلت‌های بارگذاری تا زمانی که تلاشی خوانده می‌شود؛ تپش آن‌ها به prefers-reduced-motion احترام می‌گذارد.',
  'exams.skippingTheWrittenInvalidationLevel': 'حذف سطح ابطال نوشته‌شده',
  'exams.started': 'آغاز',
  'exams.statisticsOfOutcomes': 'آمار نتایج',
  'exams.theDirectionOfTheTrade': 'جهت معامله',
  'exams.theNumberOfUnitsFromStopDistanceAnd': 'تعداد واحدها، از فاصله حد ضرر و بودجه',
  'exams.theRewardTarget': 'هدف سود',
  'exams.theRulesThisInterfaceFollows': 'قواعدی که این رابط دنبال می‌کند',
  'exams.theWrittenPreTradeChecklist': 'چک‌لیست نوشته‌شده پیش از معامله',
  'exams.time': 'زمان',
  'exams.timeLimit': 'محدودیت زمانی',
  'exams.timingIsEnforcedByTheService':
    'زمان‌بندی را سرویس اعمال می‌کند، نه کارخواه، پس بستن پنجره نمی‌تواند تلاشی را تمدید کند.',
  'exams.turningARiskBudgetIntoAUnitCount':
    'تبدیل بودجه ریسک به تعداد واحد، بدون گرد کردن به بالا.',
  'exams.unlocksWhen': 'باز می‌شود وقتی',
  'exams.verdictsArriveWithTheServerS':
    'حکم‌ها همراه توضیح سرور می‌رسند و به تلاش پیوست می‌شوند، پس همان بازبینی بعدها هم بازتولیدپذیر است.',
  'exams.whatAChecklistMustContainToBeWorth':
    'یک چک‌لیست برای ارزشمند بودن چه چیزی باید داشته باشد.',
  'exams.whatAnAssessmentGuarantees': 'یک ارزیابی چه چیزی را تضمین می‌کند',
  'exams.whatTheReviewIsFor': 'بازبینی برای چیست',
  'exams.whatTheRunnerWouldKnowAbout': 'آنچه موتور اجرای آزمون دربارهٔ این تلاش می‌دانست',
  'exams.whichOfTheseAreValidReasonsToExpress':
    'کدام‌یک از این‌ها دلایل معتبری برای بیان نتیجه بر حسب R به‌جای ارز است؟',
  'exams.whyATenTradeSampleIsNotEvidenceOf': 'چرا نمونه‌ای با ده معامله شاهدی بر یک مزیت نیست.',
  'exams.whyTheLossSideIsDecidedBeforeThe':
    'اینکه چرا سمت زیان پیش از در نظر گرفتن ورود تعیین می‌شود.',
  'exams.writtenPlanEvidenceHumanApprovedChanges':
    'طرح نوشته‌شده، شواهد، تغییرات تأییدشده توسط انسان',
  // examsPage ───────────────────────────────────────────────────
  'examsPage.anAttemptSubmittedWithoutAGradingJobStays':
    'تلاشی که بدون کار تصحیح ارسال شود در حالت انتظار می‌ماند و به‌عنوان در انتظار برچسب می‌خورد، نه امتیازدار.',
  'examsPage.anUntouchedCategoryIsStatedPlainlyRatherThan':
    'یک دسته دست‌نخورده صریح گفته می‌شود، نه پشت یک صفر پنهان.',
  'examsPage.assessmentScoringAndMistakeReviewAcrossTheSixMonth':
    'ارزیابی، نمره‌دهی و بازبینی اشتباه‌ها در طول دوره شش‌ماهه. تصحیح مبتنی بر روبریک و قطعی است؛ مدل نتایج را توضیح می‌دهد اما هرگز قبولی یا رد را تعیین نمی‌کند.',
  'examsPage.closestAttempt74': 'نزدیک‌ترین تلاش: 74%',
  'examsPage.directionIsAnInputToTheSetupNot': 'جهت ورودی ستاپ است، نه خروجی بودجه ریسک.',
  'examsPage.everyStateTheModuleMustRenderWithThe':
    'هر حالتی که ماژول باید رندر کند، همراه با کنشی که هر یک ارائه می‌دهد.',
  'examsPage.examinationsPassed': 'آزمون‌های قبول‌شده',
  'examsPage.failuresAndBlanksAreNeverRenderedAsZeroes':
    'شکست‌ها و خالی‌ها هرگز به‌صورت صفر رندر نمی‌شوند.',
  'examsPage.groupedByTheCurriculumAreaTheyTestThe':
    'گروه‌بندی‌شده بر اساس حوزه درسی که می‌آزمایند؛ میانگین نمونه‌وار است.',
  'examsPage.groupingByCauseTurnsAScoreIntoA':
    'گروه‌بندی بر اساس علت، یک نمره را به یک درس تبدیل می‌کند.',
  'examsPage.history': 'تاریخچه',
  'examsPage.improvedAfterRework': 'پس از بازکار بهتر شد',
  'examsPage.lockedExaminationsAreExcludedFromWhatIsAchievable':
    'آزمون‌های قفل‌شده از آنچه امروز دست‌یافتنی است کنار گذاشته می‌شوند.',
  'examsPage.matchesTheRubricTheBudgetAndTheStop':
    'با روبریک می‌خواند: بودجه و فاصله حد ضرر اندازه را تعیین می‌کنند.',
  'examsPage.mistakeReview': 'بازبینی اشتباه‌ها',
  'examsPage.partiallyCorrectRewardIsComparedAgainstRiskBut':
    'تا حدی درست: پاداش با ریسک مقایسه می‌شود، اما چیزی نیست که بودجه اول تعیین می‌کند.',
  'examsPage.questionsAnswered': 'پرسش‌های پاسخ‌داده‌شده',
  'examsPage.unlockedAssessmentsOrderedByWhenTheyBecameAvailable':
    'ارزیابی‌های بازشده، به ترتیب زمانی که در دسترس قرار گرفته‌اند.',
  // experimentTimeline ──────────────────────────────────────────
  'experimentTimeline.anExperimentHasNoHistoryUntilAHypothesis':
    'یک آزمایش تا زمانی که فرضیه‌ای نوشته نشود تاریخچه‌ای ندارد، پس این فهرست به‌حکم طراحی خالی شروع می‌شود.',
  'experimentTimeline.approvalRequested': 'تأیید درخواست شد',
  'experimentTimeline.evaluationAttached': 'ارزیابی پیوست شد',
  'experimentTimeline.statusChange': 'تغییر وضعیت',
  // feedbackStates ──────────────────────────────────────────────
  'feedbackStates.aCompletedActionConfirmedItSharesTheBrand':
    'یک کنش کامل‌شده، تأییدشده. همان سبز برند را دارد و پرشدگی آن از آن متفاوت است.',
  'feedbackStates.aConfirmationRatherThanAReportTheOnly':
    'یک تأیید است، نه یک گزارش. تنها سطح بازخوردی که درخشش دارد، چون یک تصمیم سزاوار وزن بیشتری از یک اطلاع است.',
  'feedbackStates.aFailureReportedWithItsTypedCodeAs':
    'یک شکست، با کد تایپ‌شده‌اش به‌عنوان شاهد گزارش می‌شود، نه با بازگویی در متن.',
  'feedbackStates.aStatementWithNoVerdictOfItsOwn':
    'گزاره‌ای بدون داوری مستقل — بافت، یک شمارش، یک یادداشت.',
  'feedbackStates.announcedPolitelyInformationDoesNotInterruptWhichIs':
    'مؤدبانه اعلام می‌شود. اطلاعات وقفه ایجاد نمی‌کند، و همین است که وقفه را معنادار نگه می‌دارد.',
  'feedbackStates.checkThisBeforeContinuing': 'پیش از ادامه بررسی کنید',
  'feedbackStates.failure': 'شکست',
  'feedbackStates.information': 'اطلاعات',
  'feedbackStates.note': 'یادداشت',
  'feedbackStates.nothingToReport': 'چیزی برای گزارش نیست',
  'feedbackStates.proceedAbleButNotSilentlySomethingHereMayNot':
    'قابل ادامه است، اما نه بی‌صدا: ممکن است چیزی اینجا آنچه منظور بود نباشد.',
  'feedbackStates.raisedThroughTheSharedProviderSoItPauses':
    'از طریق ارائه‌دهنده مشترک نمایش داده می‌شود، پس وقتی به سمتش می‌روید متوقف می‌شود.',
  'feedbackStates.success': 'موفق',
  'feedbackStates.thatCouldNotBeDone': 'انجام نشد',
  'feedbackStates.thatWorked': 'انجام شد',
  'feedbackStates.thisCannotBeUndone': 'این کار برگشت‌پذیر نیست',
  'feedbackStates.warning': 'هشدار',
  'feedbackStates.worthKnowing': 'دانستنی است',
  // holdingsEditor ──────────────────────────────────────────────
  'holdingsEditor.assetClass': 'کلاس دارایی',
  'holdingsEditor.averageEntryPrice': 'میانگین قیمت ورود',
  'holdingsEditor.baseCurrency': 'ارز پایه',
  'holdingsEditor.blankStaysBlankNeverReadAsZero': 'خالی خالی می‌ماند — هرگز صفر خوانده نمی‌شود.',
  'holdingsEditor.cashWeight': 'وزن نقدی (%)',
  'holdingsEditor.currentPrice': 'قیمت فعلی',
  'holdingsEditor.declaredWeight': 'وزن اعلام‌شده (%)',
  'holdingsEditor.name': 'نام',
  'holdingsEditor.optionalAndUsedOnlyWhenNoPriceExists':
    'اختیاری، و تنها زمانی استفاده می‌شود که هیچ قیمتی برای پوزیشن وجود ندارد.',
  'holdingsEditor.optionalTheShareHeldAsCashWhenYou':
    'اختیاری. سهم نگه‌داشته‌شده به‌صورت نقد، زمانی که می‌خواهید شمرده شود.',
  'holdingsEditor.priceObservedAt': 'زمان مشاهده قیمت',
  'holdingsEditor.required': 'الزامی.',
  'holdingsEditor.requiredWithAPriceAnUndatedPriceIs':
    'با قیمت الزامی است: قیمت بدون تاریخ به‌عنوان فرض تلقی می‌شود.',
  // holdingsTable ───────────────────────────────────────────────
  'holdingsTable.declaredPositionsWithTheFiguresComputedFromEach':
    'پوزیشن‌های اعلام‌شده همراه با ارقام محاسبه‌شده از هر یک',
  'holdingsTable.notPriced': 'بدون قیمت',
  'holdingsTable.nothingHasBeenDeclaredForThisAccountYet':
    'هنوز چیزی برای این حساب اعلام نشده است. چیزی به‌جای یک دارایی نمایش داده نمی‌شود: یک سطر نمونه، ادعایی واقعی درباره پول کسی خواهد بود.',
  // inputQualitySummary ─────────────────────────────────────────
  'inputQualitySummary.inputsAssessed': 'ورودی‌های ارزیابی‌شده',
  'inputQualitySummary.requiredAndUsable': 'الزامی و قابل استفاده',
  // interfaceStates ─────────────────────────────────────────────
  'interfaceStates.aReadThatFailedWithItsTypedReason': 'خواندنی که شکست خورد، با دلیل تایپ‌شده‌اش.',
  'interfaceStates.aSuccessfulReadThatFoundNothing': 'خواندن موفقیت‌آمیزی که چیزی پیدا نکرد.',
  'interfaceStates.beforeDataArrivesTheLayoutIsAlreadyThe':
    'پیش از رسیدن داده‌ها؛ چیدمان از قبل شکل درست را دارد.',
  // journal ─────────────────────────────────────────────────────
  'journal.021RVsPrevious14': '+0.21R در برابر 14 مورد پیشین',
  'journal.044VsPrevious14': '+0.44 در برابر 14 مورد پیشین',
  'journal.14Scored2StillOpen': '14 امتیازخورده · 2 هنوز باز',
  'journal.14ScoredTrades': '14 معامله امتیازدار',
  'journal.16RecordsPlannedRisk': '16 سابقه، ریسک برنامه‌ریزی‌شده',
  'journal.3TradesNotAssessedYet': '3 معامله هنوز ارزیابی نشده',
  'journal.42PtsVsPrevious14': '+4.2 واحد در برابر 14 مورد پیشین',
  'journal.7WinsIn14ScoredTrades': '7 برد در 14 معامله امتیازدار',
  'journal.8CompliantOf13Assessed': '8 منطبق از 13 ارزیابی‌شده',
  'journal.aBreakoutAttemptFailsAndPriceReEntersThe':
    'تلاش برای شکست ناموفق می‌شود و قیمت به محدوده‌ای که ترک کرده بود بازمی‌گردد.',
  'journal.aDayWhoseRecordsWereNever':
    'روزی که رکوردهایش هرگز نمره نخورده‌اند «نمره‌نخورده» گزارش می‌شود نه صفر، و روزی که معامله‌ای ندارد یک خانهٔ صریحاً خنثی است نه یک خانهٔ خالی.',
  'journal.aFlatResultAfterAFullStopDistance':
    'نتیجه‌ای مسطح پس از یک فاصله کامل حد ضرر، یک زیان مدیریت‌شده است، نه معامله‌ای هدررفته.',
  'journal.aGapHoldsItsOpeningRangeInsteadOf':
    'گپ محدوده بازگشایی خود را نگه می‌دارد و پر نمی‌شود.',
  'journal.aLevelBreaksPriceReturnsToItAnd':
    'سطحی می‌شکند، قیمت به آن برمی‌گردد، و بازآزمون پیش از ادامه مقاومت می‌کند.',
  'journal.aRateIsOnlyMeaningfulWithItsSample': 'یک نرخ تنها با حجم نمونه‌اش معنادار است.',
  'journal.aRateIsReportedOverAssessed':
    'هر نرخ تنها بر پایهٔ رکوردهای سنجیده‌شده گزارش می‌شود؛ رکوردهای سنجیده‌نشده نمایش داده می‌شوند، نه به‌عنوان سازگار شمرده می‌شوند.',
  'journal.aRecordIsAnAppendTo':
    'یک رکورد افزودنی به دفتر معاملات است. نمی‌تواند قاعده‌ای را فعال کند و نمی‌تواند به کارگزاری برسد. تغییر قواعد به ارزیابی و تأیید ثبت‌شدهٔ انسان نیاز دارد، که سطوحی جدا هستند.',
  'journal.aRecordIsNotAResult': 'رکورد یک نتیجه نیست',
  'journal.aRecordWithNoReviewCannot': 'رکوردی که بازبینی ندارد قابل بررسی نیست',
  'journal.aReviewIsWrittenFromThe':
    'بازبینی از روی رکورد نوشته می‌شود و رکورد برای جا شدن در بازبینی ویرایش نمی‌شود.',
  'journal.aRowRsquoSLeftEdge':
    'لبهٔ چپ هر سطر نتیجهٔ آن را حمل می‌کند: سبز برای سود، سرخ برای زیان، خاکستری برای سربه‌سر، آبی برای رکورد باز. سطر بایگانی‌شده کم‌رنگ می‌شود نه پنهان، چون رکورد بایگانی‌شده همچنان دلیل یک تصمیم بعدی است.',
  'journal.aRuleBreakAndAnUnscored':
    'نقض قاعده و رکورد نمره‌نخورده هر دو بازبینی را الزامی می‌کنند، هر چه پیامد بوده باشد.',
  'journal.aStreakIsAPropertyOf': 'توالی ویژگی یک نمونهٔ کوچک است، نه ویژگی معامله‌گر.',
  'journal.aWidenedStopIsASecondDecisionThat':
    'حد ضرر بازترشده، تصمیم دومی است که هرگز برنامه‌ریزی نشده بود.',
  'journal.aboveThe025RStudyThreshold': 'بالاتر از آستانه مطالعه 0.25R',
  'journal.actionsOnARecord': 'کارهایی روی یک رکورد',
  'journal.after': 'پس از آن.',
  'journal.aiReviewNotice':
    'در این مرحله هیچ ارائه‌دهندهٔ مدلی به دفتر معاملات متصل نیست. این پنل‌ها وضعیت‌هایی را نشان می‌دهند که سطح بازبینی باید پوشش دهد؛ هیچ‌کدام بازبینی واقعی نیست و وضعیت کامل‌شده یک نمونهٔ چیدمان برچسب‌خورده است.',
  'journal.aiReviewState.completed': 'کامل‌شده',
  'journal.aiReviewState.failed': 'ردشده',
  'journal.aiReviewState.not-available': 'در دسترس نیست',
  'journal.aiReviewState.pending': 'در انتظار',
  'journal.aiReviewState.processing': 'در حال پردازش',
  'journal.allRecordsInTheCurrentView': 'همه سوابق در نمای فعلی',
  'journal.anEstablishedTrendPullsIntoAZoneOf':
    'روندی تثبیت‌شده به ناحیه‌ای از تقاضای پیشین برمی‌گردد بدون شکستن ساختار.',
  'journal.anObviousHighOrLowIsTakenAnd':
    'یک سقف یا کف واضح گرفته و در همان ایمپالس بازپس گرفته می‌شود.',
  'journal.anUnclosedRecordCannotBeReviewedSoIt':
    'سابقه‌ای بسته‌نشده قابل بازبینی نیست، پس هنوز نمی‌تواند چیزی بیاموزد.',
  'journal.analyticsTimeframe': 'بازهٔ زمانی تحلیل',
  'journal.andKeepsYourValuesInThe':
    'و مقادیر شما را در فرم نگه می‌دارد، چون فرمی که «ذخیره شد» بگوید و چیزی ذخیره نشده باشد، بدترین رفتار ممکن برای یک دفتر معاملات است.',
  'journal.anyMarket': 'هر بازار',
  'journal.anyResult': 'هر نتیجه',
  'journal.anySession': 'هر نشست',
  'journal.anySetup': 'هر ستاپ',
  'journal.anyState': 'هر وضعیت',
  'journal.anyStatus': 'هر وضعیت',
  'journal.appendedInOrderNothingHereIs':
    'به ترتیب افزوده می‌شود. هیچ‌چیز اینجا بازنویسی نمی‌شود، پس خوانش پیشین در دسترس می‌ماند.',
  'journal.archived': 'بایگانی‌شده',
  'journal.assessedSeparatelyFromTheOutcome': 'جدا از پیامد سنجیده می‌شود',
  'journal.attachmentKind.analysis': 'تصویر تحلیل',
  'journal.attachmentKind.entry': 'تصویر ورود',
  'journal.attachmentKind.exit': 'تصویر خروج',
  'journal.attachmentKind.markup': 'یادداشت روی نمودار',
  'journal.attachmentNote':
    'تنها فرادادهٔ پیوست‌ها — در این مرحله هیچ فایل تصویری ذخیره نمی‌شود، پس هر پیش‌نمایش یک جای‌نگهدار است که از رکورد کشیده شده است.',
  'journal.attachmentSlotsAreRecordedAsMetadata':
    'جایگاه‌های پیوست تنها به‌عنوان فراداده ثبت می‌شوند. در این مرحله هیچ فایلی بارگذاری یا ذخیره نمی‌شود، پس هیچ‌چیز اینجا نباید تصویر ذخیره‌شده خوانده شود.',
  'journal.averageLoss': 'میانگین زیان',
  'journal.averageR': 'میانگین R',
  'journal.averageRMultiple': 'میانگین مضرب R',
  'journal.averageRewardToRisk': 'میانگین بازده به ریسک',
  'journal.averageRiskPerTrade': 'میانگین ریسک هر معامله',
  'journal.averageWin': 'میانگین برد',
  'journal.averageWinVsAverageLoss': 'میانگین برد در برابر میانگین زیان',
  'journal.awaitingAConnectedProviderNoGenerated':
    'در انتظار ارائه‌دهندهٔ متصل — هیچ متن تولیدشده‌ای ذخیره نمی‌شود',
  'journal.awaitingAReview': 'در انتظار بازبینی',
  'journal.awaitingAReviewScope': 'در انتظار بازبینی · دامنه',
  'journal.before': 'پیش از آن ·',
  'journal.bestPairOfTheMonthOnProcessNot': 'بهترین جفت ماه بر اساس فرایند، نه بر اساس نتیجه.',
  'journal.both': 'هر دو',
  'journal.breakdowns': 'تفکیک‌ها',
  'journal.breakeven': 'سربه‌سر ·',
  'journal.breakoutRetest': 'بازآزمون شکست',
  'journal.broken': 'نقض‌شده',
  'journal.bucket': 'دسته',
  'journal.calendarDayState.breakeven': 'روز خنثی',
  'journal.calendarDayState.flat': 'بدون معامله',
  'journal.calendarDayState.loss': 'روز زیان‌ده',
  'journal.calendarDayState.mixed': 'روز مختلط',
  'journal.calendarDayState.open': 'پوزیشن باز',
  'journal.calendarDayState.win': 'روز سودده',
  'journal.calendarView': 'نمای تقویم',
  'journal.cancel': 'انصراف',
  'journal.captured': 'ثبت‌شده',
  'journal.chartTimeframe': 'بازهٔ زمانی نمودار',
  'journal.checklist': 'چک‌لیست',
  'journal.checklistFullyFollowed': 'چک‌لیست به‌طور کامل رعایت شد.',
  'journal.chooseARecord': 'یک رکورد انتخاب کنید',
  'journal.clearDay': 'پاک کردن روز',
  'journal.close': 'بستن',
  'journal.closeActionsMenu': 'بستن منوی کارها',
  'journal.closeColumnOptions': 'بستن گزینه‌های ستون',
  'journal.closed': 'بسته‌شده',
  'journal.columns': 'ستون‌ها',
  'journal.committedRisk': 'ریسک متعهدشده',
  'journal.committedRiskAcross': 'ریسک متعهدشده در',
  'journal.compliance.compliant': 'سازگار',
  'journal.compliance.not-assessed': 'سنجیده‌نشده',
  'journal.compliance.partial': 'تا حدی',
  'journal.compliance.violation': 'قاعده نقض شده',
  'journal.compliance2.compliant': 'همهٔ قواعد چک‌لیست پیش از معامله رعایت شدند.',
  'journal.compliance2.not-assessed': 'این معامله هنوز با چک‌لیست بررسی نشده است.',
  'journal.compliance2.partial': 'بخشی از قواعد رعایت شد؛ دست‌کم یکی رعایت نشد.',
  'journal.compliance2.violation':
    'قاعده‌ای آگاهانه نقض شد یا برنامه در میانهٔ معامله کنار گذاشته شد.',
  'journal.complianceNotAssessed': 'پایبندی ارزیابی نشد',
  'journal.compliant': 'سازگار ·',
  'journal.consecutiveWinsAndLosses': 'بردها و باخت‌های پیاپی',
  'journal.core': 'هسته',
  'journal.cumulativeRAfterEachScoredTradeOldestFirst':
    'R تجمعی پس از هر معامله امتیازدار، از قدیمی‌ترین.',
  'journal.cumulativeRPerformance': 'عملکرد R تجمعی',
  'journal.currentRun': 'دورهٔ جاری',
  'journal.curve': 'منحنی',
  'journal.customRangeEndDate': 'تاریخ پایان بازهٔ دلخواه',
  'journal.customRangeStartDate': 'تاریخ آغاز بازهٔ دلخواه',
  'journal.defaults': 'پیش‌فرض‌ها',
  'journal.direction.long': 'خرید',
  'journal.direction.short': 'فروش',
  'journal.discardThisRecord': 'این رکورد کنار گذاشته شود؟',
  'journal.distanceBelowTheHighWaterMarkOfTheR':
    'فاصله زیر بالاترین سطح منحنی R. صفر یعنی یک سقف جدید.',
  'journal.distributionAndRisk': 'توزیع و ریسک',
  'journal.drawdown': 'افت سرمایه',
  'journal.during': 'در جریان ·',
  'journal.emotionalState.anxious': 'مضطرب',
  'journal.emotionalState.calm': 'آرام',
  'journal.emotionalState.confident': 'مطمئن',
  'journal.emotionalState.detached': 'بی‌طرف',
  'journal.emotionalState.fearful': 'ترسان',
  'journal.emotionalState.focused': 'متمرکز',
  'journal.emotionalState.frustrated': 'دلخور',
  'journal.emotionalState.greedy': 'طمع‌کار',
  'journal.emotionalState.hesitant': 'دو‌دل',
  'journal.emotionalState.impulsive': 'تکانشی',
  'journal.enteredBeforeTheLevelWasReached': 'پیش از رسیدن به سطح وارد شد',
  'journal.entryWasSlightlyEarlyAgainstTheChecklist': 'ورود در برابر چک‌لیست کمی زود بود',
  'journal.equityCurve': 'منحنی ارزش حساب',
  'journal.eventRiskIsEitherSizedForOrAvoided':
    'ریسک رویداد یا برای آن اندازه‌گذاری می‌شود یا از آن پرهیز می‌شود.',
  'journal.everyRecordAccountedForIncludingTheTwoThat':
    'همه سوابق حساب شده‌اند، از جمله آن دو که هنوز امتیاز نگرفته‌اند.',
  'journal.executionRiskAndManagement': 'اجرا، ریسک و مدیریت',
  'journal.exitManagementDrifted': 'مدیریت خروج از مسیر خارج شد',
  'journal.expectancyOverTime': 'انتظار در طول زمان',
  'journal.export': 'خروجی',
  'journal.failedBreakout': 'شکست ناموفق',
  'journal.filteringIsHowAReviewStarts': 'فیلتر کردن نقطهٔ شروع هر بازبینی است',
  'journal.flaggedByTheRecordARule':
    'علامت‌خورده از سوی رکورد: نقض قاعده، معاملهٔ نمره‌نخورده یا موردی از چک‌لیست که نادیده مانده است',
  'journal.flaggedByTheRecordNotBy': 'علامت‌خورده از سوی رکورد، نه از سوی نتیجه',
  'journal.forTheAnalyticsSectionAbove': 'برای بخش تحلیل بالا.',
  'journal.fourteenScoredTradesIsASample':
    'چهارده معاملهٔ نمره‌خورده یک نمونه است، نه یک نتیجه. هر عدد در این صفحه نمونه است.',
  'journal.from': 'از',
  'journal.gapContinuation': 'ادامه گپ',
  'journal.grossWin1543RGrossLoss577R': 'سود ناخالص 15.43R ÷ زیان ناخالص 5.77R',
  'journal.haveNoMarketContextRecordedAt': 'هیچ زمینهٔ بازاری برای آن‌ها ثبت نشده است.',
  'journal.heldPastTheExitPlan': 'بیش از طرح خروج نگه داشته شد',
  'journal.heldTheRunnerToThePlannedLevelInstead':
    'اجازه داد اجر تا سطح برنامه‌ریزی‌شده برود، نه تا اولین واکنش.',
  'journal.heldThroughAScheduledEvent': 'در طول یک رویداد زمان‌بندی‌شده نگه داشته شد',
  'journal.higherTimeframeBiasWrittenBeforeEntry': 'بایاس تایم‌فریم بالاتر پیش از ورود نوشته شد',
  'journal.holdingTimeAcrossThe14ScoredTrades': 'زمان نگهداری در 14 معامله امتیازدار.',
  'journal.illustrativeValues': 'مقادیر نمونه',
  'journal.incomplete': 'ناتمام ·',
  'journal.interfaceStates': 'وضعیت‌های رابط',
  'journal.invalidationLevelWrittenDownBeforeEntry': 'سطح ابطال پیش از ورود نوشته شد',
  'journal.itIsTheTraderRsquoS':
    'این خوانش خودِ معامله‌گر از آن روز است که در همان زمان ثبت شده — در مقایسه با همان مقدار در روزی دیگر سودمند است و به‌عنوان نمره بی‌معنا.',
  'journal.journalSections': 'بخش‌های دفتر معاملات',
  'journal.labelledSoItIsNeverRead': 'برچسب خورده تا هرگز به‌عنوان سنجه خوانده نشود',
  'journal.layoutExampleNoModelProviderIs':
    'نمونهٔ چیدمان. در این مرحله هیچ ارائه‌دهندهٔ مدلی متصل نیست، پس هر فیلد در ادامه به‌حکم ساختار خالی است — این شکلی است که یک بازبینی به خود می‌گیرد، نه یک بازبینی.',
  'journal.lesson': 'درس',
  'journal.lessons': 'درس‌ها',
  'journal.liquiditySweep': 'جاروی نقدینگی',
  'journal.longestLosingRun': 'بلندترین توالی باخت',
  'journal.longestWinningRun': 'بلندترین توالی برد',
  'journal.losses': 'باخت‌ها ·',
  'journal.losses2': 'زیان‌ها',
  'journal.marked': 'علامت‌خورده',
  'journal.markedAnd': 'علامت‌خورده، و',
  'journal.markedAsARuleBreakOnPurpose': 'عمداً به‌عنوان تخلف قاعده علامت خورد.',
  'journal.market.crypto': 'ارز دیجیتال',
  'journal.market.equities': 'سهام',
  'journal.market.forex': 'فارکس',
  'journal.market.futures': 'آتی',
  'journal.marketAnalysis': 'تحلیل بازار',
  'journal.maximumDrawdown': 'حداکثر افت سرمایه',
  'journal.measure': 'سنجه',
  'journal.methodNote':
    'دفتر معاملات یک ثبت است، نه یک تابلوی امتیاز. نرخ بدون اندازهٔ نمونه شایعه است، پس اندازهٔ نمونه کنار هر نرخ نمایش داده می‌شود و معاملهٔ ثبت‌نشده ثبت‌نشده می‌ماند.',
  'journal.mistakeFrequency': 'بسامد اشتباه‌ها',
  'journal.mistakes': 'اشتباه‌ها',
  'journal.mistakesAndLessons': 'اشتباه‌ها و درس‌ها',
  'journal.n10': 'n/۱۰',
  'journal.narrowingToOneSetupOneSession':
    'محدود کردن به یک ستاپ، یک نشست یا یک وضعیت قاعده نقطهٔ مطلب است: دفتری که تنها از سر تا ته خوانده شود، یادداشت روزانه است.',
  'journal.netPerformance': 'عملکرد خالص',
  'journal.neverByTheInterfaceAndNever': '، هرگز توسط رابط و هرگز توسط مدل.',
  'journal.newTradeRecord': 'رکورد معاملهٔ تازه',
  'journal.next': 'بعدی',
  'journal.noAttachmentsOnThisRecord': 'پیوستی روی این رکورد نیست',
  'journal.noHighImpactEventInsideTheHoldingWindow': 'رویداد پرتأثیری داخل پنجره نگهداری نیست',
  'journal.noInvalidationLevelWritten': 'سطح ابطالی نوشته نشده',
  'journal.noMarketContextWasRecordedFor':
    'هیچ زمینهٔ بازاری برای این معامله ثبت نشده است. به‌عنوان ناموجود نشان داده می‌شود، نه به‌عنوان سرفصل خالی.',
  'journal.noModelWritesANumberHere': 'هیچ مدلی اینجا عددی نمی‌نویسد',
  'journal.noPsychologyRecordedForThisTrade': 'هیچ روان‌شناسی‌ای برای این معامله ثبت نشده است.',
  'journal.noReviewsWrittenYet': 'هنوز بازبینی‌ای نوشته نشده است',
  'journal.noStoreIsConnectedYet': 'هنوز هیچ فروشگاهی متصل نیست',
  'journal.noTrades': 'بدون معامله',
  'journal.noWrittenPlanForThisRecord':
    'برای این رکورد برنامهٔ نوشته‌شده‌ای وجود ندارد. سطح‌ها در بالا نمایش داده می‌شوند؛ استدلال پشت آن‌ها ثبت نشده است.',
  'journal.none': 'هیچ‌کدام',
  'journal.notAssessedExcludedFromTheRate':
    'سنجیده‌نشده — از نرخ کنار گذاشته می‌شود، نه اینکه سازگار شمرده شود.',
  'journal.notScored': 'نمره‌نخورده',
  'journal.nothingHereIsASignalA':
    'هیچ‌چیز اینجا سیگنال، توصیه یا قاعده نیست. تغییر قاعده به ارزیابی و تأیید ثبت‌شدهٔ انسان نیاز دارد.',
  'journal.nothingIsWaitingForAReview': 'هیچ‌چیز در انتظار بازبینی نیست',
  'journal.nothingRecordedAsAMistake': 'هیچ‌چیز به‌عنوان اشتباه ثبت نشده است.',
  'journal.nothingToPlotYet': 'هنوز چیزی برای ترسیم نیست',
  'journal.oneRecordStillHasNoExit': 'یک سابقه هنوز خروجی ندارد',
  'journal.open': 'باز ·',
  'journal.openTheRecord': 'باز کردن رکورد',
  'journal.packagesTradingEngine': 'packages/trading-engine',
  'journal.partial': 'تا حدی ·',
  'journal.performance': 'عملکرد',
  'journal.performanceByDirection': 'عملکرد به تفکیک جهت',
  'journal.performanceBySession': 'عملکرد به تفکیک نشست',
  'journal.performanceBySetup': 'عملکرد به تفکیک ستاپ',
  'journal.placeholderNoImageFileStored': 'جای‌نگهدار · هیچ فایل تصویری ذخیره نمی‌شود',
  'journal.planned': 'برنامه‌ریزی‌شده',
  'journal.plannedBeforeEntry': 'برنامه‌ریزی‌شده، پیش از ورود',
  'journal.plannedLevelsOf16Records': 'سطوح برنامه‌ریزی‌شده 16 سابقه',
  'journal.plannedNotAchievedRealisedRIsReportedSeparately':
    'برنامه‌ریزی‌شده، محقق نشده: R محقق‌شده جداگانه گزارش می‌شود.',
  'journal.plannedRRAgainstRealisedAverage': 'R:R برنامه‌ریزی‌شده در مقابل میانگین R محقق‌شده',
  'journal.plannedRewardIsAtLeastTwiceTheRisk': 'بازده برنامه‌ریزی‌شده حداقل دو برابر ریسک است',
  'journal.plannedRiskPerTradeAgainstTheAccountBudget':
    'ریسک برنامه‌ریزی‌شده هر معامله در برابر بودجه حساب. مسطح بودن هدف است، نه بالا بودن.',
  'journal.plannedVersusActual': 'برنامه‌ریزی‌شده در مقابل واقعی',
  'journal.plannedVersusActualRR': 'R:R برنامه‌ریزی‌شده در مقابل واقعی',
  'journal.positionLargerThanTheWrittenRisk': 'پوزیشن بزرگ‌تر از ریسک نوشته‌شده',
  'journal.positionSizeMatchesTheWrittenRisk': 'اندازه پوزیشن با ریسک نوشته‌شده می‌خواند',
  'journal.previewNotice':
    'پیش‌نمایش رابط — دادهٔ نمونهٔ دفتر معاملات. در این مرحله هیچ فروشگاهی برای دفتر معاملات متصل نیست، پس معامله‌ها، تصویرها و آمار زیر نمونه‌های چیدمان‌اند، نه رکوردهای شما و نه عملکرد سنجیده‌شده.',
  'journal.priceReachesTheEdgeOfADefinedRange': 'قیمت به لبه یک رنج مشخص می‌رسد و آن را رد می‌کند.',
  'journal.profitFactor': 'ضریب سود',
  'journal.protectingASmallGainIsAValidDecision':
    'محافظت از یک سود کوچک تصمیم معتبری است و زیان نیست.',
  'journal.psychology': 'روان‌شناسی',
  'journal.queuedAPendingReviewIsThe':
    'در صف. بازبینی معلق یعنی نبود بازبینی، و همین‌طور برچسب می‌خورد نه اینکه به‌عنوان نتیجهٔ خالی نمایش داده شود.',
  'journal.r': 'R',
  'journal.rCurveAcross14ScoredTrades': 'منحنی R در 14 معامله امتیازدار',
  'journal.rangeReversal': 'بازگشت در رنج',
  'journal.readOnly': 'فقط‌خواندنی',
  'journal.readingTheseNumbers': 'خواندن این عددها',
  'journal.realisedResult': 'نتیجهٔ محقق‌شده',
  'journal.reclaimInsideTheSameImpulseIsTheConfirmation': 'بازپس‌گیری در همان ایمپالس تأیید است.',
  'journal.recordHistory': 'تاریخچهٔ رکورد',
  'journal.recordStates': 'وضعیت‌های رکورد',
  'journal.recordedPatternsEachWithItsCorrective': 'الگوهای ثبت‌شده، هر یک با یادداشت اصلاحی خود',
  'journal.recordedPatternsWithTheCorrectiveNote': 'الگوهای ثبت‌شده، همراه یادداشت اصلاحی',
  'journal.recordingChangesNothing': 'ثبت کردن چیزی را تغییر نمی‌دهد',
  'journal.recordingIsNotAdopting': 'ثبت کردن به‌معنای پذیرفتن نیست',
  'journal.records': 'رکورد',
  'journal.records2': 'رکورد ·',
  'journal.recordsByChecklistOutcome': 'رکوردها بر پایهٔ نتیجهٔ چک‌لیست',
  'journal.recordsByState': 'رکوردها بر پایهٔ وضعیت',
  'journal.recordsCarryAWrittenReview': 'رکورد بازبینی نوشته‌شده دارند.',
  'journal.recordsInThePreviewIncludingOne':
    'رکورد در پیش‌نمایش، که یک رکورد باز و یک رکورد ناتمام هم آگاهانه میان آن‌هاست.',
  'journal.reset': 'بازنشانی',
  'journal.result.breakeven': 'سربه‌سر',
  'journal.result.loss': 'زیان',
  'journal.result.pending': 'نمره‌نخورده',
  'journal.result.win': 'سود',
  'journal.retryReview': 'تلاش دوبارهٔ بازبینی',
  'journal.review': 'بازبینی',
  'journal.reviewAssistance': 'کمک به بازبینی',
  'journal.reviewAssistanceExplainsARecordIt':
    'کمک به بازبینی یک رکورد را توضیح می‌دهد. هرگز عدد تولید نمی‌کند، معامله را نمره نمی‌زند و قاعده‌ای را تغییر نمی‌دهد.',
  'journal.reviewState.not-required': 'بازبینی لازم نیست',
  'journal.reviewState.required': 'بازبینی لازم است',
  'journal.reviewState.reviewed': 'بازبینی‌شده',
  'journal.reviewStateToPreview': 'وضعیت بازبینی برای پیش‌نمایش',
  'journal.reviewStates': 'وضعیت‌های بازبینی',
  'journal.reviewed': 'بازبینی‌شده ·',
  'journal.reviewsAwaitingYou': 'بازبینی‌های در انتظار شما',
  'journal.riskConsistency': 'یکنواختی ریسک',
  'journal.riskConsistencyMattersMoreThanAnySingleResult':
    'یکنواختی ریسک مهم‌تر از هر نتیجه واحدی است.',
  'journal.riskExceededTheDailyBudget': 'ریسک از بودجه روزانه فراتر رفت',
  'journal.riskIsNotCalculatedHere': 'ریسک اینجا محاسبه نمی‌شود',
  'journal.riskIsWithinTheDailyBudget': 'ریسک داخل بودجه روزانه است',
  'journal.rows': 'سطرها',
  'journal.rowsAreBucketsOfTheSame':
    'سطرها سبدهایی از همان رکوردها هستند، نه نمونه‌های مستقل — سبدی با نمونهٔ کوچک یک اشاره است، نه یک یافته.',
  'journal.rowsPerPage': 'سطر در هر صفحه',
  'journal.ruleAdherence': 'پایبندی به قاعده',
  'journal.ruleCompliance': 'رعایت قواعد',
  'journal.runningAverageRAsEachNewScoredTrade':
    'میانگین متحرک R با رسیدن هر معامله امتیازدار جدید — نمایش داده می‌شود تا حرکت کند، و در ابتدا نادیده گرفته شود.',
  'journal.sameAsTheLastPointOnTheEquity': 'همانند آخرین نقطه روی منحنی ارزش حساب',
  'journal.sample': 'نمونه',
  'journal.saveDraft': 'ذخیرهٔ پیش‌نویس',
  'journal.scope': 'دامنه:',
  'journal.scored': 'نمره‌خورده ·',
  'journal.screenshotsAndAttachments': 'تصویرها و پیوست‌ها',
  'journal.screenshotsForTheseRecordsLiveOn':
    'تصویرهای این رکوردها روی هر معامله می‌مانند؛ برای دیدنشان رکوردی را باز کنید.',
  'journal.searchSymbolReferenceSetupOrTag': 'جست‌وجوی نماد، شناسه، ستاپ یا برچسب',
  'journal.searchTrades': 'جست‌وجوی معامله‌ها',
  'journal.selected': 'انتخاب‌شده.',
  'journal.selfReportedAndTimestampedTheseAre':
    'خودگزارشی و زمان‌دار. این‌ها خوانش خود معامله‌گر در آن لحظه‌اند، نه سنجه‌ای که سامانه می‌گیرد.',
  'journal.selfReportedAtTheTime': 'خودگزارشی در همان زمان',
  'journal.selfReportedEmotionalRead': 'خوانش احساسی خودگزارشی',
  'journal.session.asia': 'آسیا',
  'journal.session.london': 'لندن',
  'journal.session.new-york': 'نیویورک',
  'journal.session.overlap': 'همپوشانی لندن و نیویورک',
  'journal.setupFamily.continuation': 'ادامه‌دهنده',
  'journal.setupFamily.range': 'بازگشت به میانه',
  'journal.setupFamily.reversal': 'برگشتی',
  'journal.sevenSectionsOpenedOneAtA':
    'هفت بخش، که یکی‌یکی باز می‌شوند. خطاها همراه سرصفحهٔ جمع‌شده می‌آیند، پس بخشی که بسته است هرگز نمی‌تواند مشکلی را پنهان کند.',
  'journal.sharesAreOfTheRecordedOccurrences':
    'سهم‌ها از موارد ثبت‌شده‌اند، پس یک هفتهٔ کم‌رویداد شبیه پیشرفت به نظر نمی‌رسد.',
  'journal.sharesAreOfTheRecordedOccurrences2':
    'سهم‌ها از موارد ثبت‌شده‌اند. الگویی که تکرار شده بیش از یک زیان بزرگ یک‌باره ارزش توجه دارد.',
  'journal.showAll': 'نمایش همه',
  'journal.sizeIsDerivedFromTheStopDistanceNever':
    'حجم از فاصله حد ضرر استخراج می‌شود، هرگز از اطمینان.',
  'journal.sizedAboveTheWrittenRisk': 'بزرگ‌تر از ریسک نوشته‌شده اندازه‌گذاری شد',
  'journal.sortedBy': 'مرتب‌شده بر پایهٔ',
  'journal.source': 'منبع:',
  'journal.statNote':
    'هر عدد شاخص یک ثابت نمونه است که دستی چیده شده است. مقادیر واقعی از تحلیل قطعی دفتر معاملات در موتور معاملات می‌آیند، هرگز از مدل.',
  'journal.statedInAccountCurrency': 'به ارز حساب بیان شده',
  'journal.status.archived': 'بایگانی‌شده',
  'journal.status.closed': 'بسته‌شده',
  'journal.status.incomplete': 'ناتمام',
  'journal.status.open': 'باز',
  'journal.stopMovedAwayFromThePlan': 'حد ضرر از طرح فاصله گرفت',
  'journal.streaksReadFromTheRecordedSequence': 'توالی‌ها از ترتیب ثبت‌شده خوانده می‌شوند',
  'journal.structuredSummariesOnlyAReviewExplains':
    'تنها خلاصه‌های ساختاریافته: یک بازبینی رکورد را توضیح می‌دهد. نمی‌تواند ابزاری را اجرا کند، قاعده‌ای را تغییر دهد یا چیزی سفارش دهد.',
  'journal.studyPrompts': 'نکته‌های مطالعاتی',
  'journal.submitTrade': 'ثبت معامله',
  'journal.sumOfScoredRNetOfTheCurve': 'جمع R امتیازدار، خالص‌شده در منحنی',
  'journal.t': 't',
  'journal.thatRecordCouldNotBeFound': 'آن رکورد پیدا نشد',
  'journal.the3UnassessedTradesAreExcludedRatherThan':
    'آن 3 معامله ارزیابی‌نشده حذف می‌شوند، نه منطبق شمرده می‌شوند.',
  'journal.theBarIsIndeterminateOnPurpose':
    'نوار آگاهانه بی‌پایان است: تا وقتی کاری پیشرفتی گزارش نکند، پیشرفتی برای گزارش وجود ندارد.',
  'journal.theChecklistItemThatWasSkippedWasThe':
    'مورد چک‌لیستی که حذف شد همان بود که قیمت را بهتر می‌کرد.',
  'journal.theDayHasASummaryBut': 'روز خلاصه‌ای دارد اما در این نما رکورد قابل بازکردنی ندارد.',
  'journal.theDenominatorForEveryOtherFigureOnThis': 'مخرج هر رقم دیگر در این صفحه.',
  'journal.theEmotionalScoreIsSelfReported': 'امتیاز احساسی خودگزارشی است',
  'journal.theExitPlanIsPartOfThePlan': 'طرح خروج بخشی از طرح است.',
  'journal.theFailedPushIntoTheHighWasThe': 'پوش ناموفق به سقف، کل معامله بود.',
  'journal.theFormChecksThatTheLevels':
    'فرم بررسی می‌کند که سطح‌ها با جهت هم‌خوان باشند. ریسک، چندبرابر R یا حجم شما را محاسبه نمی‌کند — آن‌ها از موتور قطعی می‌آیند، و فرمی که آن‌ها را از خود بسازد خطرناک‌ترین جزء این برنامه می‌شد.',
  'journal.theFormRecordsTheLevelsYou':
    'فرم سطح‌هایی را که وارد می‌کنید ثبت می‌کند و بررسی می‌کند که با جهت هم‌خوان باشند. حجم پوزیشن، چندبرابرهای R و هر آماره توسط موتور قطعی در',
  'journal.theJournalStoresWhatWasDone':
    'دفتر معاملات ثبت می‌کند چه کاری انجام شده است. اینکه آیا این فرآیند ارزش تکرار دارد، پرسشی برای سطح پژوهش است، جایی که هر ادعا به نمونه و تأیید نیاز دارد.',
  'journal.theLargestSingleLossOnRecordAndThe': 'بزرگ‌ترین زیان تک در سوابق، و آموزنده‌ترین آن‌ها.',
  'journal.theLosingTradeWasACleanPlanExecuted':
    'معامله زیان‌ده یک طرح پاک بود که درست اجرا شد. همچنان منطبق شمرده می‌شود.',
  'journal.theOneFigureThatSurvivesASmallSample':
    'تنها رقمی که از نمونه کوچک بهترین جان سالم به‌در می‌برد — و همچنان به یکی نیاز دارد.',
  'journal.thePlanIsWhatWasWritten':
    'برنامه چیزی است که پیش از ورود نوشته شده؛ ستون واقعی چیزی است که رکورد نشان می‌دهد.',
  'journal.theRangeEdgeIsALocationNotA': 'لبه رنج یک موقعیت است، نه یک سیگنال.',
  'journal.theRatioThatMakesABelow50WinRate': 'نسبتی که یک نرخ برد زیر 50% را قابل تحمل می‌کند.',
  'journal.theRetestIsTheTradeAnticipatingItIs':
    'خود بازآزمون معامله است. پیش‌دستی کردن روی آن معامله‌ای متفاوت و بدتر است.',
  'journal.theSafetyBoundary': 'مرز ایمنی',
  'journal.theSameCurveAsEquityReadAsOne':
    'همان منحنی ارزش حساب، اما به‌صورت یک عدد برای هر معامله و نه یک جمع جاری.',
  'journal.theSameSetupProducedALossAndA':
    'همان ستاپ در یک روز یک زیان و یک سود داد؛ فرایند متفاوت بود، نه ستاپ.',
  'journal.theSetupIsValidForThisTradingSession': 'ستاپ برای این سشن معاملاتی معتبر است',
  'journal.theSweepWasRealTheEntryWasEarly': 'جارو واقعی بود؛ ورود زود بود.',
  'journal.theTradeListCouldNotBe': 'فهرست معامله‌ها خوانده نشد',
  'journal.theTypedReasonIsShownInstead':
    'دلیل نوع‌دار نمایش داده می‌شود، نه دادهٔ خام ارائه‌دهنده. تلاش دوباره تنها پیشنهاد می‌شود چون قطعی سرویس ارائه‌دهنده از آن شکست‌هایی است که ممکن است برطرف شود.',
  'journal.theWriteIsNotSubmittingReports': 'نوشتن این‌گونه نیست. ارسال گزارش می‌کند',
  'journal.thereIsNoRowActionThat':
    'هیچ کار سطری‌ای چیزی سفارش نمی‌دهد، تغییر نمی‌دهد یا نمی‌بندد. این برنامه چنین توانی ندارد و منو هم چنین چیزی را القا نمی‌کند.',
  'journal.thisMonth': 'این ماه.',
  'journal.to': 'تا',
  'journal.totalTrades': 'کل معاملات',
  'journal.tradeCountNetRRiskCompliance':
    'شمار معامله‌ها، R خالص، ریسک، رعایت قواعد، ستاپ اصلی، احساس',
  'journal.tradeDuration': 'مدت معامله',
  'journal.tradeEvent.assessment': 'رعایت قواعد سنجیده شد',
  'journal.tradeEvent.edit': 'رکورد ویرایش شد',
  'journal.tradeEvent.entry': 'ورود پر شد',
  'journal.tradeEvent.exit': 'پوزیشن بسته شد',
  'journal.tradeEvent.management': 'برنامه تعدیل شد',
  'journal.tradeEvent.recorded': 'معامله ثبت شد',
  'journal.tradeEvent.review': 'بازبینی نوشته شد',
  'journal.tradeFilters': 'فیلترهای معامله',
  'journal.tradeHistory': 'تاریخچهٔ معامله‌ها',
  'journal.tradeIsTakenFromAPreMarkedLevel': 'معامله از یک سطح پیش‌علامت‌گذاری‌شده گرفته می‌شود',
  'journal.tradeRange.custom': 'بازهٔ دلخواه',
  'journal.tradeRange.last-30': '۳۰ روز گذشته',
  'journal.tradeRange.last-90': '۹۰ روز گذشته',
  'journal.tradeRange.this-month': 'این ماه',
  'journal.tradeRange.this-week': 'این هفته',
  'journal.tradeRange.today': 'امروز',
  'journal.tradedTheEdgeWithoutARejection': 'لبه را بدون رد شدن معامله کرد',
  'journal.trades': 'معامله ·',
  'journal.trading': 'معامله‌گری',
  'journal.tradingCalendar': 'تقویم معاملات',
  'journal.tradingJournal': 'دفتر معاملات',
  'journal.trendPullback': 'بازگشت در روند',
  'journal.twoPositionsCarriedOverOneWasLeftIncomplete':
    'دو پوزیشن منتقل شد؛ یکی در پایان سشن ناتمام ماند.',
  'journal.unchanged': 'بدون تغییر',
  'journal.unsavedChanges': 'تغییرهای ذخیره‌نشده',
  'journal.unscored': 'نمره‌نخورده',
  'journal.unscoredTheRecordHasNoExit':
    'نمره‌نخورده: رکورد خروجی ندارد، پس چندبرابر محقق‌شده‌ای برای نمایش وجود ندارد.',
  'journal.validationIsRealTheFormRefuses':
    'اعتبارسنجی واقعی است: فرم رکوردی را که نماد، ستاپ، سطح ابطال ندارد، یا سطح‌هایی دارد که با جهت در تناقض‌اند، نمی‌پذیرد.',
  'journal.viewEditDuplicateArchiveDeleteReview':
    'دیدن، ویرایش، تکثیر، بایگانی، حذف، بازبینی، تصویرها.',
  'journal.viewFullscreen': 'نمایش تمام‌صفحه',
  'journal.visibleColumns': 'ستون‌های قابل نمایش',
  'journal.waitingForThePullbackIntoTheZoneGave': 'صبر برای بازگشت به ناحیه، حد ضرری منطقی داد.',
  'journal.whatADayHolds': 'یک روز چه چیزی در خود دارد',
  'journal.whatHappensWhenYouSubmitIn': 'در این مرحله هنگام ارسال چه رخ می‌دهد',
  'journal.whatTheAnalyticsDoNotSupport': 'آنچه تحلیل‌ها پشتیبانی نمی‌کنند',
  'journal.whatTheRecordTaught': 'آنچه رکورد آموخت',
  'journal.whatWasPlannedAndWhatWas': 'چه چیزی برنامه‌ریزی شده بود و چه چیزی واقعاً انجام شد',
  'journal.whereTheNumbersComeFrom': 'عددها از کجا می‌آیند',
  'journal.wideningTheStopChangesTheRiskSoIt':
    'بازتر کردن حد ضرر ریسک را تغییر می‌دهد، پس معامله را تغییر می‌دهد.',
  'journal.winLossDistribution': 'توزیع سود / زیان',
  'journal.winRate': 'نرخ برد',
  'journal.winRateAndAverageRCan':
    'نرخ برد و میانگین R می‌توانند ناسازگار باشند؛ هرگاه چنین شد، عددی که باید نگاه کرد امید ریاضی است.',
  'journal.wins': 'بردها ·',
  'journal.wins2': 'بردها',
  'journal.worstPeakToTroughOnTheRCurve': 'بدترین افت از قله تا کف روی منحنی R',
  'journal.writeTheLevelBeforeTheEntryNotAfter': 'سطح را پیش از ورود بنویس، نه پس از افت.',
  'journal.writeUps': 'نوشتارها',
  'journal.writingARecordCannotActivateA':
    'نوشتن یک رکورد نمی‌تواند قاعده‌ای را فعال کند، محدودیت‌های ریسک را تغییر دهد یا به کارگزاری برسد. تاریخچه را می‌افزاید و همان‌جا می‌ایستد.',
  'journal.writtenBeforeTheEntryNotAfter': 'پیش از ورود نوشته می‌شود، نه پس از آن',
  // journalCalendar ─────────────────────────────────────────────
  'journalCalendar.clearTheSelectedDay': 'پاک کردن روز انتخاب‌شده',
  'journalCalendar.month': 'ماه',
  'journalCalendar.week': 'هفته',
  // journalPage ─────────────────────────────────────────────────
  'journalPage.aBucketWhoseRealisedResultSitsBelowThe':
    'سطلی که نتیجه محقق‌شده‌اش زیر سطح برنامه‌ریزی‌شده می‌نشیند، شکاف میان طرح و اجرا است، نه یک نظر درباره بازار.',
  'journalPage.aJournalWithRecordsButNoLessonsIs':
    'دفتر معاملاتی با سوابق اما بدون درس، فقط یک لاگ است. درس‌ها همان‌طور که نوشته می‌شوند اینجا ظاهر می‌شوند.',
  'journalPage.aRuleBreakOrAnUnscoredRecordForces':
    'یک تخلف قاعده یا یک سابقه امتیازنگرفته بازبینی را الزامی می‌کند.',
  'journalPage.accountRiskAsPlanned': 'ریسک حساب همان‌طور که برنامه‌ریزی شده بود.',
  'journalPage.addTrade': 'افزودن معامله',
  'journalPage.anEmptyTableAfterFilteringIsASelected':
    'جدول خالی پس از فیلترکردن یک زیرمجموعه انتخاب‌شده و خالی است، نه یک دفتر معاملات خالی — و پیشنهاد پاک کردن فیلترها را می‌دهد.',
  'journalPage.analytics': 'تحلیل‌ها',
  'journalPage.calendar': 'تقویم',
  'journalPage.checklist': 'چک‌لیست',
  'journalPage.complianceNote': 'یادداشت پایبندی',
  'journalPage.everyChartStatesItsScopeAndEveryOne':
    'هر نمودار دامنه‌اش را اعلام می‌کند و همه قابل بزرگ‌نمایی به تمام‌صفحه هستند.',
  'journalPage.everyRecordItsPlanItsRiskWhetherThe':
    'هر سابقه، طرحش، ریسکش، اینکه قواعد رعایت شدند یا نه و چه چیزی آموخت. دفتر معاملات سابقه‌ای از تصمیم‌ها است، نه یک تابلوی امتیاز — پس حجم نمونه همراه هر نرخ می‌آید و یک مقدار غایب غایب می‌ماند.',
  'journalPage.everyRecordThatRequiredAReviewHasOne':
    'هر سابقه‌ای که بازبینی لازم داشت، بازبینی دارد. این حالت دست‌یافتنی است — خطا نیست.',
  'journalPage.exportIsNotConnectedInThisPhaseThe':
    'خروجی‌گرفتن در این فاز متصل نیست: کنش همین را گزارش می‌کند، نه اینکه فایل خالی بسازد.',
  'journalPage.exportTheCurrentJournalView': 'خروجی گرفتن از نمای فعلی دفتر معاملات',
  'journalPage.howTheJournalBehavesBeforeRecordsArriveWhen':
    'اینکه دفتر معاملات پیش از رسیدن سوابق چگونه رفتار می‌کند، وقتی فیلتری چیزی انتخاب نمی‌کند، و وقتی انبار خوانده نمی‌شود.',
  'journalPage.improvements': 'بهبودها',
  'journalPage.management': 'مدیریت',
  'journalPage.noMistakesRecorded': 'اشتباهی ثبت نشده',
  'journalPage.noRecordsMatchTheseFilters': 'هیچ سابقه‌ای با این فیلترها مطابقت ندارد',
  'journalPage.nothingRecordedAsAMistake': 'هیچ چیزی به‌عنوان اشتباه ثبت نشده',
  'journalPage.oneLinePerReviewedRecordTheWhole':
    'یک سطر برای هر سابقه بازبینی‌شده — کل دلیل وجود دفتر معاملات.',
  'journalPage.openTheAddTradeForm': 'باز کردن فرم افزودن معامله',
  'journalPage.plannedEntry': 'ورود برنامه‌ریزی‌شده',
  'journalPage.plannedRewardToRiskIsTheDashedReferenceTheBars':
    'بازده به ریسک برنامه‌ریزی‌شده خط‌چین مرجع است؛ ستون‌ها آنچه سوابق محقق کرده‌اند را نشان می‌دهند، بر حسب ستاپ.',
  'journalPage.readingTheJournal': 'خواندن دفتر معاملات',
  'journalPage.realisedAverageR': 'میانگین R محقق‌شده',
  'journalPage.realisedR': 'R محقق‌شده',
  'journalPage.recordedEntryExit': 'ورود → خروج ثبت‌شده',
  'journalPage.records': 'سوابق',
  'journalPage.reviewState': 'وضعیت بازبینی',
  'journalPage.reviewsAndLessons': 'بازبینی‌ها و درس‌ها',
  'journalPage.riskCommitted': 'ریسک متعهدشده',
  'journalPage.theComparisonTheJournalExistsForWhatWas':
    'همان مقایسه‌ای که دفتر معاملات برای آن وجود دارد: آنچه قصد شده بود در برابر آنچه رخ داد.',
  'journalPage.theFailureReportsItsTypedReasonAFailed':
    'شکست دلیل تایپ‌شده‌اش را گزارش می‌کند. خواندن ناموفق هرگز به‌عنوان دفتر معاملات خالی رندر نمی‌شود.',
  'journalPage.theJournalStoreAndItsExportPipelineArrive':
    'انبار دفتر معاملات و خط لوله خروجی‌گرفتن آن همراه یکپارچه‌سازی API می‌آید. چیزی نوشته نشد و هیچ فایلی ساخته نشد.',
  'journalPage.theJournalStoreCouldNotBeRead': 'انبار دفتر معاملات خوانده نشد',
  'journalPage.theKeyZoneMarketStructureAndLiquidityContext':
    'ناحیه کلیدی، ساختار بازار و بافت نقدینگی متن درون سابقه‌اند، پس به‌صورت متن زیر نشان داده می‌شوند و نه به‌عنوان خطوطی که داده از آن پشتیبانی نمی‌کند.',
  'journalPage.thePlaceholderMatchesTheTableItIsStanding':
    'جانگهدار با جدولی که جای آن را گرفته مطابقت دارد، پس چیدمان با رسیدن سوابق نمی‌جهد.',
  'journalPage.theReferenceDoesNotMatchARecordIn':
    'مرجع با هیچ سابقه‌ای در نمای دفتر معاملات مطابقت ندارد. چیزی تغییر نکرد.',
  'journalPage.thesis': 'تز',
  'journalPage.tradeDetails': 'جزئیات معامله',
  'journalPage.twoPointsOnlyTheRecordedEntryAndThe':
    'فقط دو نقطه: ورود ثبت‌شده و خروج ثبت‌شده. هیچ مسیر قیمتی میانی اختراع نمی‌شود.',
  'journalPage.unscoredRecordsShowAGapNotAZero': 'سوابق امتیازنگرفته یک شکاف نشان می‌دهند، نه صفر.',
  'journalPage.volatility': 'نوسان',
  'journalPage.wentWell': 'خوب پیش رفت',
  'journalPage.whatTheJournalIsForAndWhatIt':
    'دفتر معاملات برای چه چیزی است، و از ادعای چه چیزی امتناع می‌کند',
  'journalPage.writtenBeforeEntry': 'پیش از ورود نوشته شده.',
  // journalTrades ───────────────────────────────────────────────
  'journalTrades.aBoundaryTestedRepeatedlyIsThinnerThanIt':
    'مرزی که مکرراً آزموده شده، نازک‌تر از آن چیزی است که به نظر می‌رسد.',
  'journalTrades.aCentralBankSpeakerAfterTheHoldingWindow':
    'سخنگوی بانک مرکزی پس از پنجره نگهداری.',
  'journalTrades.aCloseAbove21310InvalidatesTheRangeRead':
    'بسته‌شدن بالای 21310 خوانش رنج را باطل می‌کند.',
  'journalTrades.aCloseBackInside58405844WithoutARejection':
    'بسته‌شدن دوباره داخل 5840–5844 بدون رد شدن، ستاپ را باطل می‌کند.',
  'journalTrades.aCloseBelow5800ShouldHaveEndedThe':
    'بسته‌شدن زیر 5800 باید معامله را پایان می‌داد.',
  'journalTrades.aFifteenMinuteCloseAbove19005': 'بسته‌شدن پانزده‌دقیقه‌ای بالای 190.05.',
  'journalTrades.aFifteenMinuteCloseBackBelowTheSweepLow':
    'بسته‌شدن پانزده‌دقیقه‌ای دوباره زیر کف جارو.',
  'journalTrades.aFifteenMinuteCloseBelow11060': 'بسته‌شدن پانزده‌دقیقه‌ای زیر 1.1060.',
  'journalTrades.aFifteenMinuteCloseBelowTheSweepLow': 'بسته‌شدن پانزده‌دقیقه‌ای زیر کف جارو.',
  'journalTrades.aLevelThatProducedTwoFailedPushesIs':
    'سطحی که دو پوش منجر به شکست داده، پس از شکستن و بازآزمون شدن، احتمال بیشتری برای مقاومت در تلاش سوم دارد.',
  'journalTrades.aLosingTradeThatFollowedEveryRuleCompliance':
    'معامله‌ای زیان‌ده که همه قواعد را رعایت کرد. پایبندی نتیجه نیست.',
  'journalTrades.aMidSessionReleaseWasIgnored': 'یک انتشار میان‌سشن نادیده گرفته شد.',
  'journalTrades.aOneHourCloseBelow62900': 'بسته‌شدن یک‌ساعته زیر 62900.',
  'journalTrades.aSetup': 'ستاپ A+',
  'journalTrades.aTrendThatPullsIntoAPriorBreakout':
    'روندی که به شلف شکست پیشین برمی‌گردد، ریسک مشخصی در خلاف روند پیشنهاد می‌دهد.',
  'journalTrades.aboveAverage': 'بالاتر از میانگین.',
  'journalTrades.aboveAverageTheDayRangeWas14The':
    'بالاتر از میانگین؛ دامنه روز 1.4 برابر میانگین بیست‌روزه بود.',
  'journalTrades.allEightChecklistItemsWereSatisfiedBeforeEntry':
    'هر هشت مورد چک‌لیست پیش از ورود تأمین شده بود.',
  'journalTrades.asiaSession': 'سشن آسیا',
  'journalTrades.asianHighSwept': 'سقف آسیا جارو شد',
  'journalTrades.average': 'میانگین.',
  'journalTrades.bearishRejectionFromTheShelfButEnteredBefore':
    'رد شدن نزولی از شلف، اما پیش از بسته‌شدن تأییدی وارد شد.',
  'journalTrades.beingEarlyIsNotTheSameAsBeing':
    'زود بودن با درست بودن یکی نیست، حتی وقتی جواب می‌دهد.',
  'journalTrades.belowAverageTheRangeWasNarrow': 'پایین‌تر از میانگین؛ دامنه باریک بود.',
  'journalTrades.bestExecutionOnRecordForThisSetup': 'بهترین اجرای ثبت‌شده برای این ستاپ.',
  'journalTrades.bullishEngulfingCloseBackAboveTheShelf': 'بسته‌شدن پوششی صعودی به بالای شلف.',
  'journalTrades.buySideLiquidityAboveTheAsianSessionHighWas':
    'نقدینگی سمت خرید بالای سقف سشن آسیا ابتدا گرفته شد.',
  'journalTrades.checklistCompleteTheExitCameInSlightlyUnder':
    'چک‌لیست کامل؛ خروج کمی زیر هدف طرح انجام شد.',
  'journalTrades.checklistCompleteTheRunnerWasAllowedPastThe':
    'چک‌لیست کامل؛ اجازه داده شد اجر از هدف طرح عبور کند.',
  'journalTrades.cleanHigherLowsOnTheFifteenMinuteChart':
    'کف‌های بالاتر پاک روی نمودار پانزده‌دقیقه‌ای.',
  'journalTrades.cleanLoss': 'زیان پاک',
  'journalTrades.countHowManyTimesALevelWasTested':
    'بشمار چند بار یک سطح آزموده شده، پیش از معکوس معامله کردن روی آن.',
  'journalTrades.counterTrendRalliesIntoAPriorHighOfferA':
    'رالی‌های خلاف روند به یک سقف پیشین، حد ضرر مشخصی بالای شلف پیشنهاد می‌دهند.',
  'journalTrades.dailyAboveThePriorWeekHighBiasLong':
    'روزانه بالای سقف هفته پیشین؛ بایاس خرید بالای 5800.',
  'journalTrades.dailyBias': 'بایاس روزانه',
  'journalTrades.dailyBullishButTheOverlapSessionWasChoppy':
    'روزانه صعودی، اما سشن هم‌پوشانی پرنوسان بود.',
  'journalTrades.dailyDowntrend': 'روند نزولی روزانه',
  'journalTrades.dailyDowntrendRalliesSoldIntoThePriorDay':
    'روند نزولی روزانه؛ رالی‌ها به سقف روز پیشین فروخته شد.',
  'journalTrades.dailyTrend': 'روند روزانه',
  'journalTrades.dailyUptrendButTheFourHourChartWasRolling':
    'روند صعودی روزانه، اما نمودار چهارساعته در حال برگشت بود.',
  'journalTrades.dailyUptrendPriceAboveThePriorWeekClose':
    'روند صعودی روزانه، قیمت بالای بسته‌شدن هفته پیشین.',
  'journalTrades.earlyEntry': 'ورود زود',
  'journalTrades.elevatedIntoTheOverlap': 'بالا در سشن هم‌پوشانی.',
  'journalTrades.enteredBeforeTheRejectionClose': 'پیش از بسته‌شدن تأییدی وارد شد',
  'journalTrades.enteredOnApproachWithoutARejection': 'در نزدیک شدن بدون رد شدن وارد شد',
  'journalTrades.entryCameFromTheShelfNotFromThe': 'ورود از شلف آمد، نه از بازگشایی.',
  'journalTrades.entryOnTheHigherLowAfterTheReclaim':
    'ورود روی کف بالاتر پس از بازپس‌گیری، با حد ضرر زیر کف جارو.',
  'journalTrades.entryTakenOnApproachRatherThanOnA': 'ورود در نزدیک شدن انجام شد، نه در رد شدن.',
  'journalTrades.entryTakenOnTheFirstLowerCloseAfter':
    'ورود در نخستین بسته‌شدن پایین‌تر پس از فتیله رد شدن.',
  'journalTrades.entryWasTakenOnTheSweepItselfRather':
    'ورود روی خود جارو انجام شد، نه روی بازپس‌گیری.',
  'journalTrades.entryWasTakenOneCandleBeforeTheRejection':
    'ورود یک کندل پیش از بسته‌شدن مبتنی بر رد شدن انجام شد.',
  'journalTrades.equalHighsAt5858TakenBeforeTheRetest':
    'سقف‌های برابر در 5858 پیش از بازآزمون گرفته شد.',
  'journalTrades.executionRecord': 'سابقه اجرا',
  'journalTrades.exitAt25ROrOnInvalidation': 'خروج در 2.5R یا در ابطال.',
  'journalTrades.failedPush': 'پوش ناموفق',
  'journalTrades.failedToMakeAHigherHighAfterThe': 'پس از بسته شدن لندن نتوانست سقف بالاتری بسازد.',
  'journalTrades.flatClose': 'بسته‌شدن مسطح',
  'journalTrades.fourHourTrend': 'روند چهارساعته',
  'journalTrades.fourHourUptrendIntactAbove11050': 'روند صعودی چهارساعته بالای 1.1050 دست‌نخورده.',
  'journalTrades.fullExitAt25R': 'خروج کامل در 2.5R.',
  'journalTrades.fullExitAt25ROrOnTheFirst':
    'خروج کامل در 2.5R یا در نخستین بسته‌شدن پانزده‌دقیقه‌ای زیر شلف در حال صعود.',
  'journalTrades.fullExitAt25ROrOnTheFirst2': 'خروج کامل در 2.5R یا در نخستین کف بالاتر.',
  'journalTrades.halfOffAt15RStopToBreakevenAfter':
    'نصف در 1.5R خارج شد، حد ضرر بعد از آن به سربه‌سر.',
  'journalTrades.halfWasTrimmedAt15RAsPlanned':
    'نصف همان‌طور که برنامه‌ریزی شده بود در 1.5R کم شد.',
  'journalTrades.hardStopThePlatformAtTheDailyRiskLimit':
    'پلتفرم را در محدودیت ریسک روزانه به‌سختی متوقف کن.',
  'journalTrades.heldTheRunnerToThePlannedLevelRather':
    'اجر را تا سطح برنامه‌ریزی‌شده نگه داشت، نه تا اولین واکنش.',
  'journalTrades.highExpandingAfterTheSweep': 'بالا، پس از جارو در حال گسترش.',
  'journalTrades.highThePairWasMovingOnARate':
    'بالا؛ جفت‌ارز اواخر هفته با یک تصمیم نرخ بهره در حرکت بود.',
  'journalTrades.higherHighsAndHigherLowsThroughTheEuropean':
    'سقف‌های بالاتر و کف‌های بالاتر در طول سشن اروپا.',
  'journalTrades.higherLowsOnTheFourHourChart': 'کف‌های بالاتر روی نمودار چهارساعته.',
  'journalTrades.ignoredAScheduledRelease': 'یک انتشار زمان‌بندی‌شده را نادیده گرفت',
  'journalTrades.keepTheSweepAndReclaimRequirementForEverySessionLowE':
    'شرط جارو و بازپس‌گیری را برای هر ورود روی کف سشن نگه دار.',
  'journalTrades.keepTheTwoStepEntryRuleForEveryBreakoutRetest':
    'قاعده ورود دومرحله‌ای را برای هر بازآزمون شکست در این سشن نگه دار.',
  'journalTrades.levelRetestedTwice': 'سطح دو بار بازآزمون شد',
  'journalTrades.logTheTrimDecisionAtTheTimeRather':
    'تصمیم کاهش را در همان زمان ثبت کن، نه در بسته‌شدن.',
  'journalTrades.londonSession': 'سشن لندن',
  'journalTrades.low': 'پایین.',
  'journalTrades.lowerHighsAndLowerLowsAcrossTheLondon':
    'سقف‌های پایین‌تر و کف‌های پایین‌تر در طول سشن لندن.',
  'journalTrades.lowerHighsIntoTheLondonOpen': 'سقف‌های پایین‌تر به سمت بازگشایی لندن.',
  'journalTrades.lowerHighsIntoTheRangeLow': 'سقف‌های پایین‌تر به سمت کف رنج.',
  'journalTrades.lowerTimeframeHigherLowInsideTheZoneThenA':
    'کف بالاتر در تایم‌فریم پایین‌تر داخل ناحیه، سپس بسته‌شدن به بالای آن.',
  'journalTrades.managedExit': 'خروج مدیریت‌شده',
  'journalTrades.moveTheStopToBreakevenOnlyAfter1R':
    'حد ضرر را فقط پس از 1R به سربه‌سر منتقل کن، هرگز پیش از آن.',
  'journalTrades.movedTheStopAwayFromThePlan': 'حد ضرر را از طرح فاصله داد',
  'journalTrades.needsExit': 'نیازمند خروج',
  'journalTrades.neutralPriceInsideAThreeDayRange': 'بی‌طرف: قیمت داخل رنج سه‌روزه.',
  'journalTrades.neutralPriceInsideThePriorDayRange': 'بی‌طرف: قیمت داخل دامنه روز پیشین.',
  'journalTrades.noAdjustmentPlannedTheStopWasTheThesis':
    'تعدیلی برنامه‌ریزی نشده؛ حد ضرر همان تز بود.',
  'journalTrades.noEntryWithoutTheConfirmationCandleRegardlessOf':
    'بدون کندل تأیید هیچ ورودی نیست، هر قدر هم سطح واضح به نظر برسد.',
  'journalTrades.noReclaim': 'بازپس‌گیری نشد',
  'journalTrades.noReleaseDuringTheHoldingWindowButElevated':
    'در طول پنجره نگهداری خبری نبود، اما ریسک رویدادی در هفته بالا بود.',
  'journalTrades.noReleaseInsideTheWindow': 'داخل پنجره انتشار خبری نیست.',
  'journalTrades.noReleaseUntilTheAfternoon': 'تا بعدازظهر انتشار خبری نیست.',
  'journalTrades.noScheduledReleaseInsideTheHoldingWindow':
    'هیچ انتشار زمان‌بندی‌شده‌ای داخل پنجره نگهداری نیست.',
  'journalTrades.noneRecordedBeforeEntryTheLevelWas':
    'پیش از ورود هیچ‌کدام ثبت نشد — فرض شد سطح مقاومت می‌کند.',
  'journalTrades.noneScheduled': 'هیچ‌کدام زمان‌بندی نشده.',
  'journalTrades.notCheckedBeforeEntry': 'پیش از ورود بررسی نشد.',
  'journalTrades.notWrittenBeforeEntry': 'پیش از ورود نوشته نشد.',
  'journalTrades.noteThatTheBoundaryHadBeenTestedThree':
    'توجه: مرز سه بار آزموده شده بود، که یک معامله معکوس را ضعیف می‌کند.',
  'journalTrades.overnightHigh': 'سقف شبانه',
  'journalTrades.plannedStopToBreakevenAt1RActualThe':
    'برنامه‌ریزی‌شده: حد ضرر در 1R به سربه‌سر. واقعی: حد ضرر دو بار بازتر شد.',
  'journalTrades.positionOpen': 'پوزیشن باز',
  'journalTrades.priorDayLow': 'کف روز پیشین',
  'journalTrades.pullbackIntoDemand': 'بازگشت به تقاضا',
  'journalTrades.rangeBoundary': 'مرز رنج',
  'journalTrades.rangeEdge': 'لبه رنج',
  'journalTrades.rangeHigh': 'سقف رنج',
  'journalTrades.rangeLow': 'کف رنج',
  'journalTrades.rangeLowSatDirectlyBeneathAVisibleSupport':
    'کف رنج درست زیر یک خط حمایت دیدنی قرار داشت.',
  'journalTrades.rangeMid': 'میانه رنج.',
  'journalTrades.rangeWithAClearUpperBoundaryAt21310': 'رنج با سقف مشخص در 21310.',
  'journalTrades.reclaimOfThePriorDayLowWithinThe':
    'بازپس‌گیری کف روز پیشین در همان ایمپالس، سپس یک کف بالاتر.',
  'journalTrades.recordIncomplete': 'سابقه ناتمام',
  'journalTrades.recordTheTrailingRuleThatWasActuallyUsed':
    'قاعده عقب‌کشیدن که واقعاً استفاده شد را ثبت کن، نه برنامه‌ریزی‌شده را.',
  'journalTrades.recordedAsPartialComplianceEvenThoughTheTrade':
    'با وجود سودآور بودن معامله، به‌عنوان پایبندی جزئی ثبت شد.',
  'journalTrades.rejectionWickIntoTheBoundaryThenALower':
    'فتیله رد شدن به مرز، سپس بسته‌شدن پایین‌تر.',
  'journalTrades.requireARejectionCloseBeforeAnyRangeEdgeEntry':
    'پیش از هر ورود روی لبه رنج، بسته‌شدن مبتنی بر رد شدن را الزامی کن.',
  'journalTrades.retestHeldForTwoCandlesWhichWasTreated':
    'بازآزمون دو کندل مقاومت کرد و به‌عنوان تأیید تلقی شد.',
  'journalTrades.riskedPastTheDailyBudget': 'فراتر از بودجه روزانه ریسک کرد',
  'journalTrades.ruleBreak': 'تخلف قاعده',
  'journalTrades.runnerHeld': 'اجر نگه داشته شد',
  'journalTrades.sellSideLiquidityBelowTheLondonOpenLowWas':
    'نقدینگی سمت فروش زیر کف بازگشایی لندن ابتدا جارو شد.',
  'journalTrades.sellSideStopsBelowTheLondonOpenLowWere':
    'حد ضررهای سمت فروش زیر کف بازگشایی لندن در یک ایمپالس گرفته شد.',
  'journalTrades.sessionOpen': 'سشن باز',
  'journalTrades.setTheRunnerExitAtTheLevelNot': 'خروج اجر را روی سطح بگذار، نه بر اساس حس.',
  'journalTrades.shelf': 'شلف',
  'journalTrades.shelfRetest': 'بازآزمون شلف',
  'journalTrades.sizingRespectedTheWrittenRiskDespiteTheEarly':
    'اندازه‌گذاری با وجود ورود زود، ریسک نوشته‌شده را رعایت کرد.',
  'journalTrades.skippedTheInvalidationChecklistItem': 'مورد چک‌لیست ابطال را حذف کرد',
  'journalTrades.stopMoved': 'حد ضرر جابه‌جا شد',
  'journalTrades.stopToBreakevenAt1R': 'حد ضرر در 1R به سربه‌سر.',
  'journalTrades.stopToBreakevenAt1RTrailUnderEach':
    'حد ضرر در 1R به سربه‌سر، پس از 2R زیر هر کف بالاتر پانزده‌دقیقه‌ای عقب کشیده شود.',
  'journalTrades.stoppedOut': 'حد ضرر خورد',
  'journalTrades.stopsRestingAboveTheOvernightHighAt21290':
    'حد ضررها بالای سقف شبانه در 21290 قرار داشتند.',
  'journalTrades.stopsTakenBelowThePriorDayLow': 'حد ضررها زیر کف روز پیشین گرفته شد.',
  'journalTrades.stopsWereClusteredJustBelowTheRetestLow':
    'حد ضررها دقیقاً زیر کف بازآزمون متمرکز بودند.',
  'journalTrades.sweepOfTheSessionLow': 'جاروی کف سشن',
  'journalTrades.targetTheRangeMidThenReassess': 'هدف میانه رنج، سپس بازارزیابی.',
  'journalTrades.theBreakoutShelfWouldHoldAndContinueWith':
    'شلف شکست مقاومت می‌کرد و با روند روزانه ادامه می‌داد.',
  'journalTrades.theInvalidationCloseHappenedAndTheStopWas':
    'بسته‌شدن ابطال رخ داد و حد ضرر به‌جای رعایت شدن بازتر شد، که زیان را به 1.6R و فراتر از بودجه ریسک روزانه برد.',
  'journalTrades.theLevelIsALocationWithoutARejection':
    'سطح یک موقعیت است. بدون رد شدن، فقط یک امید است.',
  'journalTrades.theLossStayedInsideBudget': 'زیان داخل بودجه ماند.',
  'journalTrades.theMostInstructiveRecordInTheJournalAnd':
    'آموزنده‌ترین سابقه در دفتر معاملات، و بدترین آن.',
  'journalTrades.thePriorDayLowWouldBeSweptAnd':
    'کف روز پیشین جارو و بازپس گرفته می‌شد، همان‌طور که آن هفته دو بار شده بود.',
  'journalTrades.thePushIntoTheOvernightHighWouldFail':
    'پوش به سقف شبانه ناکام می‌ماند و به میانه رنج برمی‌گردد.',
  'journalTrades.theRangeLowWouldHoldForAThird': 'کف رنج برای بار سوم مقاومت می‌کند.',
  'journalTrades.theRetestHeldWithAHigherLowSo':
    'بازآزمون با کف بالاتر مقاومت کرد، پس حد ضرر توانست زیر ناحیه قرار بگیرد.',
  'journalTrades.theRetestIsTheTradeTheBreakIs': 'بازآزمون معامله است. شکست فقط شرط آن است.',
  'journalTrades.theRewardItemAndTheConfirmationRequirementWere':
    'مورد پاداش و شرط تأیید هر دو حذف شدند: ورود پیش از بسته‌شدن مبتنی بر رد شدن انجام شد.',
  'journalTrades.theRunnerWasClosedALittleEarlyAgainst': 'اجر کمی زودتر از طرح بسته شد.',
  'journalTrades.theRunnerWasManagedByRule': 'اجر بر اساس قاعده مدیریت شد.',
  'journalTrades.theStopSatUnderTheShelfWhichIs':
    'حد ضرر زیر شلف قرار داشت، همان‌جا که بازگشت غلط می‌شود.',
  'journalTrades.theStopWasHonouredExactlyAsPlanned':
    'حد ضرر دقیقاً همان‌طور که برنامه‌ریزی شده بود رعایت شد.',
  'journalTrades.theStopWasNotTouchedWidenedOrCancelled': 'حد ضرر دست‌نخورده، بازتر یا لغو نشد.',
  'journalTrades.theSweepSuppliesTheFuelTheReclaimIs':
    'جارو سوخت را تأمین می‌کند؛ بازپس‌گیری سیگنال است.',
  'journalTrades.theTradeWasReviewedTheSameDayAnd':
    'معامله همان روز بازبینی و به‌عنوان تخلف قاعده علامت‌گذاری شد.',
  'journalTrades.threeChecklistItemsWereSkippedNoWrittenInvalidation':
    'سه مورد چک‌لیست حذف شد: ابطال نوشته‌نشده، حجم بالاتر از ریسک نوشته‌شده، و نبود رد شدن پیش از ورود.',
  'journalTrades.treatedTheSweepAsConfirmationNoReclaimPrinted':
    'جارو را به‌عنوان تأیید تلقی کرد؛ بازپس‌گیری چاپ نشد.',
  'journalTrades.trendDay': 'روز روندی',
  'journalTrades.trimAt25RTrailTheRemainder': 'در 2.5R کم کن، باقی را عقب بکش.',
  'journalTrades.trimHalfAt2RTrailTheRemainderUnder':
    'نصف را در 2R کم کن، باقی را زیر هر کف بالاتر 5 دقیقه‌ای عقب بکش.',
  'journalTrades.trimmingIsAPlanClosingTheRestIs':
    'کم کردن یک طرح است؛ بستن باقی، تصمیمی دوم و جداگانه است.',
  'journalTrades.twoChecklistItemsAreUnrecordedSoComplianceCannot':
    'دو مورد چک‌لیست ثبت نشده، پس پایبندی به هیچ سمتی قابل ارزیابی نیست — یک ارزیابی‌نشده صادقانه به‌عنوان ارزیابی‌نشده گزارش می‌شود.',
  'journalTrades.volumeExpansionOnTheBreak': 'گسترش حجم در شکست',
  'journalTrades.waitForTheConfirmingCloseEvenWhenThe':
    'منتظر بسته‌شدن تأییدی بمان، حتی وقتی سطح واضح به نظر می‌رسد.',
  'journalTrades.waitedForTheReclaimRatherThanTheSweep': 'منتظر بازپس‌گیری ماند، نه خود جارو.',
  'journalTrades.waitedForTheRetestInsteadOfTheBreak': 'به‌جای شکست، منتظر بازآزمون ماند.',
  'journalTrades.weakTheRetestHeldForTwoCandlesOnly': 'ضعیف: بازآزمون فقط دو کندل مقاومت کرد.',
  'journalTrades.weeklyOpen': 'بازگشایی هفتگی',
  'journalTrades.whenASessionLowIsSweptAndReclaimed':
    'وقتی کف سشن جارو و بازپس گرفته می‌شود در یک ایمپالس، حد ضررهایی که گرفته شده‌اند سوخت حرکت را تأمین می‌کنند.',
  'journalTrades.whenTheInvalidationClosePrintsTheTradeIs':
    'وقتی بسته‌شدن ابطال چاپ می‌شود، معامله تمام است — بدون استثنا.',
  'journalTrades.wideningAStopIsANewTradeWith':
    'بازتر کردن حد ضرر، معامله‌ای جدید با حجمی بزرگ‌تر و بدون تز است.',
  'journalTrades.writeTheInvalidationBeforeLookingAtSize': 'ابطال را پیش از نگاه به حجم بنویس.',
  // knowledgeSearch ─────────────────────────────────────────────
  'knowledgeSearch.clearSearch': 'پاک کردن جست‌وجو',
  // lab ─────────────────────────────────────────────────────────
  'lab.activationRefusedWithoutANonExpired':
    'فعال‌سازی: بدون سطر تأییدیهٔ منقضی‌نشده که به این پیشنهاد ارجاع دهد، رد می‌شود.',
  'lab.awaitingApproval': 'در انتظار تأیید',
  'lab.calculatePositionSize': 'محاسبهٔ حجم پوزیشن',
  'lab.deterministicEvaluationSampleSizeExpectancyAnd':
    'ارزیابی قطعی: اندازهٔ نمونه، امید ریاضی و یک حکم صریح',
  'lab.deterministicToolInputTheModelNever':
    'ورودی ابزار قطعی — مدل هرگز این حساب را انجام نمی‌دهد',
  'lab.humanDecisionOnlyAnOwnerMay':
    'تصمیم انسانی: تنها مالک می‌تواند تصمیم بگیرد، و درخواست‌کننده نمی‌تواند پیشنهاد خود را تأیید کند.',
  'lab.inconclusive': 'بی‌نتیجه',
  'lab.noResultYet': 'هنوز نتیجه‌ای نیست',
  'lab.positionSizeCalculator': 'محاسبه‌گر حجم پوزیشن',
  'lab.practiceChart': 'نمودار تمرینی',
  'lab.proposalsAreDraftsUntilAnEvaluation':
    'پیشنهادها تا وقتی ارزیابی و تأیید انسانی وجود نداشته باشد، پیش‌نویس‌اند',
  'lab.proposedProcessRule': 'قاعدهٔ فرآیندی پیشنهادی',
  'lab.reject': 'رد کردن',
  'lab.requestApproval': 'درخواست تأیید',
  'lab.ruleText': 'متن قاعده',
  'lab.skipAnySetupWhereTheInvalidation':
    '«هر ستاپی که سطح ابطالش پیش از ورود نوشتنی نیست را رد کن.»',
  'lab.statesAroundAToolCall': 'وضعیت‌ها پیرامون یک فراخوان ابزار',
  'lab.statusDraftEvaluationAttachedAwaitingHuman':
    'وضعیت: پیش‌نویس → ارزیابی پیوست → در انتظار فعال‌سازی انسانی',
  'lab.syntheticSeriesForLayoutReview': '· سری ساختگی برای بررسی چیدمان',
  'lab.toolResult': 'نتیجهٔ ابزار',
  'lab.tradingLab': 'آزمایشگاه معاملات',
  'lab.tradingLabSections': 'بخش‌های آزمایشگاه معاملات',
  'lab.verdictWhenTheEvidenceIsThin': 'حکم، هنگامی که شواهد نازک است.',
  'lab.whereAToolResultWillAppear': 'جایی که نتیجهٔ ابزار ظاهر می‌شود، همراه با منشأ',
  // labels ──────────────────────────────────────────────────────
  'labels.heldForReview': 'نگه‌داشته‌شده برای بازبینی',
  'labels.notADeclaredCapability': 'قابلیت اعلام‌نشده',
  'labels.notBuiltYet': 'هنوز ساخته نشده',
  'labels.notIncludedInYourPlan': 'در طرح شما گنجانده نشده',
  'labels.periodAllowanceUsed': 'سهم دوره مصرف شد',
  'labels.planNotRecognised': 'طرح شناسایی نشد',
  'labels.subscriptionNotActive': 'اشتراک فعال نیست',
  // memory ──────────────────────────────────────────────────────
  'memory.aPromotionToVerifiedOrAuthoritative':
    'ارتقا به تأییدشده یا مرجع، فرد یا ابزاری را نام می‌برد که آن را اعطا کرده است. مدل هرگز به‌عنوان تأییدکننده پذیرفته نمی‌شود.',
  'memory.aTenTradeSampleCannotDistinguishSkillFromNoise':
    'نمونه‌ای با ده معامله نمی‌تواند مهارت را از نویز جدا کند',
  'memory.abandonedExperiment': 'آزمایش رهاشده',
  'memory.abandonedExperimentNoteTheClaimCameFromA':
    'یادداشت آزمایش رهاشده: ادعا از نمونه‌ای با یازده معامله آمده بود که برای پشتیبانی از آن خیلی کوچک است. بایگانی‌شده نگه داشته شد تا دوباره استخراج نشود.',
  'memory.academyLesson13': 'درس 1.3 آکادمی',
  'memory.academyLesson22': 'درس 2.2 آکادمی',
  'memory.academyLesson23': 'درس 2.3 آکادمی',
  'memory.academyRubric51': 'روبریک 5.1 آکادمی',
  'memory.agentAskedForAHumanCheckItCannot':
    'عامل درخواست بررسی انسانی کرد؛ خودش نمی‌تواند سابقه را ارتقا دهد.',
  'memory.agentConversation': 'گفت‌وگوی عامل',
  'memory.agentLearnings': 'آموخته‌های عامل',
  'memory.anOlderExplanationOfRuleActivationWasReturned':
    'توضیح قدیمی‌تری از فعال‌سازی قاعده پس از تغییر گردش کار بازگردانده شد. حذف‌نشان شد و ویرایش نشد، تا خطا دیدنی بماند.',
  'memory.appendOnly': 'فقط‌افزودنی',
  'memory.apr': 'آوریل',
  'memory.archivedRecords': 'رکوردهای بایگانی‌شده',
  'memory.archivedTombstonedNeverDeletedTheHistoryIsKept':
    'بایگانی شد: حذف‌نشان، هرگز پاک نشد؛ تاریخچه به‌عنوان شاهد نگه داشته می‌شود.',
  'memory.archivedWithTheReasonNotDeleted': 'با دلیلش بایگانی شد، نه پاک.',
  'memory.aug': 'اوت',
  'memory.awaitingReviewNoEvaluationRecordWasCited':
    'در انتظار بازبینی: به هیچ سابقه ارزیابی استناد نشده است.',
  'memory.capturedFromTheJournalEntry': 'از نوشته دفتر معاملات گرفته شد.',
  'memory.categories': 'دسته‌ها',
  'memory.confidenceIsAPropertyOfThe': 'اعتماد ویژگی منبع است، نه احتمالی دربارهٔ بازار.',
  'memory.confirmedAsAuthoritativeAfterReviewTheClaimIs':
    'پس از بازبینی به‌عنوان معتبر تأیید شد: ادعا گزاره‌ای درباره استنتاج است، نه درباره بازارها، و نحوه خواندن هر یافته دیگر را مقید می‌کند.',
  'memory.contextKindForTrust': 'contextKindForTrust()',
  'memory.created': 'ایجاد',
  'memory.curriculumDocument': 'سند دوره آموزشی',
  'memory.deletionIsATombstone': 'حذف به‌صورت سنگ‌قبر است',
  'memory.deterministicRTool': 'ابزار قطعی R',
  'memory.deterministicSizingTool': 'ابزار قطعی اندازه‌گذاری',
  'memory.deterministicToolOutputReCheckedByTheUserAgainst':
    'خروجی ابزار قطعی، توسط کاربر با نمونه حل‌شده درس دوباره بررسی شده است.',
  'memory.errorsThisUserActuallyMadeWithTheLesson':
    'خطاهایی که این کاربر واقعاً مرتکب شده، همراه با درسی که به آن اشاره دارند',
  'memory.events': 'رویداد',
  'memory.exampleRecordsInThisState': 'رکوردهای نمونه در این وضعیت.',
  'memory.expressingAnOutcomeInRiskUnitsRemovesPosition':
    'بیان یک نتیجه در واحد ریسک، اندازه پوزیشن را از مقایسه حذف می‌کند، و همین است که بازبینی میان ابزارها را معنادار می‌کند.',
  'memory.filterBySource': 'فیلتر بر پایهٔ منبع',
  'memory.filtersAreIndependentTrustAndSource':
    'فیلترها مستقل‌اند: اعتماد و منبع دو پرسش جدا دربارهٔ یک رکوردند.',
  'memory.findingsFromExperimentsAlwaysWithASampleSize': 'یافته‌های آزمایش‌ها، همیشه با حجم نمونه',
  'memory.fixedFractionalSizingBoundsRuinRiskBeforeItBounds':
    'اندازه‌گذاری کسری ثابت، پیش از آن‌که بازده را محدود کند ریسک نابودی را محدود می‌کند',
  'memory.humanNoteOrVerification': 'یادداشت یا تأیید انسانی',
  'memory.humanVerification': 'تأیید انسانی',
  'memory.illustrative': 'نمونه',
  'memory.illustrativeSampleOfNineRecords': 'نمونهٔ نه رکورد',
  'memory.inTheSample': 'در نمونه',
  'memory.journalEntry': 'نوشته دفتر معاملات',
  'memory.journalEntryMissingAnExplicitInvalidationLevel': 'نوشته دفتر معاملات بدون سطح ابطال صریح',
  'memory.jul': 'ژوئیه',
  'memory.jun': 'ژوئن',
  'memory.kind.document': 'سند',
  'memory.kind.human': 'انسانی',
  'memory.kind.market-data': 'دادهٔ بازار',
  'memory.kind.model': 'نوشتهٔ مدل',
  'memory.kind.synthetic': 'ساختگی',
  'memory.kind.tool': 'ابزار قطعی',
  'memory.knowledgeBase': 'پایگاه دانش',
  'memory.knowledgeGrowth': 'رشد دانش',
  'memory.knowledgeMemory': 'حافظهٔ دانش',
  'memory.marketRules': 'قواعد بازار',
  'memory.may': 'مه',
  'memory.mechanicsAndDefinitionsTheCurriculumTeaches':
    'مکانیک‌ها و تعاریفی که دوره آموزشی می‌آموزد',
  'memory.memorySections': 'بخش‌های حافظه',
  'memory.memoryStatus.archived': 'بایگانی‌شده',
  'memory.memoryStatus.pending-review': 'در انتظار بازبینی',
  'memory.memoryStatus.unverified': 'تأییدنشده',
  'memory.memoryStatus.verified': 'تأییدشده',
  'memory.memoryStatus2.archived':
    'سنگ‌قبر شده. به‌عنوان شواهد نگه داشته می‌شود: تاریخچه هرگز خاموشانه پاک نمی‌شود.',
  'memory.memoryStatus2.pending-review':
    'نوشته و منبع‌دار است و در انتظار بررسی توسط تأییدکننده‌ای غیر از مدل است.',
  'memory.memoryStatus2.unverified':
    'هنوز بررسی نشده است. می‌تواند بازیابی شود، اما هرگز به‌عنوان واقعیت ارائه نمی‌شود.',
  'memory.memoryStatus2.verified': 'انسانی یا ابزاری قطعی این را با منبعش بررسی کرده است.',
  'memory.modelAuthoredOnlyAHumanOrAToolMay':
    'نوشته‌شده توسط مدل؛ فقط انسان یا ابزار می‌تواند اعتماد آن را بالا ببرد.',
  'memory.noHistoryRecorded': 'تاریخچه‌ای ثبت نشده است',
  'memory.noKnowledgeRecorded': 'دانشی ثبت نشده است',
  'memory.noRecordsMatchThisFilter': 'هیچ رکوردی با این فیلتر نمی‌خواند',
  'memory.noSourceRecordedAnUnsourcedClaim':
    'منبعی ثبت نشده — ادعای بی‌منبع می‌تواند بازیابی شود اما هرگز به‌عنوان واقعیت ارائه نمی‌شود.',
  'memory.notAConnectedKnowledgeBase': 'پایگاه دانشِ متصل نیست',
  'memory.ofTheRecordsInTheIllustrative': 'از رکوردهای نمونه',
  'memory.openRecord': 'باز کردن رکورد',
  'memory.orderingCorrectedToBudgetStopSize': 'ترتیب به بودجه → حد ضرر → حجم اصلاح شد.',
  'memory.pendingReview': 'در انتظار بازبینی',
  'memory.personalMistakes': 'اشتباهات شخصی',
  'memory.previewFilterSubstringMatchingOnlySemantic':
    'فیلتر پیش‌نمایش: تنها تطبیق زیررشته. بازیابی معنایی (بردارها، رتبه‌بندی، یادآوری فیلترشده بر پایهٔ اعتماد) در بک‌اند پیاده‌سازی شده اما اینجا متصل نیست.',
  'memory.previewNotice':
    'پایگاه دانش نمونه. بازیابی، بردارهای معنایی و ماندگاری در بک‌اند پیاده‌سازی شده‌اند اما به این پیش‌نمایش متصل نیستند: هیچ‌چیز اینجا بازیابی یا رتبه‌بندی نشده است.',
  'memory.promotedToAuthoritativeByAHumanVerifier':
    'توسط یک تأییدکننده انسانی به معتبر ارتقا یافت.',
  'memory.proposedARuleChangeWithoutCitingAnEvaluation':
    'بدون استناد به ارزیابی، تغییری در قاعده پیشنهاد داد',
  'memory.provenanceRecorded': 'منشأ ثبت‌شده',
  'memory.rMultiplesMakeTwoDifferentSymbolsComparable':
    'مضرب‌های R دو نماد متفاوت را قابل مقایسه می‌کنند',
  'memory.recentKnowledge': 'دانش تازه',
  'memory.recordConfidence': 'اعتماد رکورد',
  'memory.recordedFromThreeConsecutiveSizingAttemptsRoundingUp':
    'ثبت‌شده از سه تلاش پیاپی اندازه‌گذاری. گرد کردن به بالا از بودجه اعلام‌شده فراتر می‌رود، پس ریسک اعلام‌شده به آرزو تبدیل می‌شود نه محدودیت.',
  'memory.recordsAcrossFiveCategories': 'رکورد در پنج دسته',
  'memory.recordsPerMonthByTrustSix': 'رکورد در هر ماه بر پایهٔ اعتماد، شش ماه مطالعه',
  'memory.removingKnowledgeMarksItArchivedAnd':
    'حذف دانش آن را بایگانی‌شده علامت می‌زند و تاریخچه را نگه می‌دارد، پس ادعایی که روزی مورد اعتماد بود همچنان قابل حسابرسی می‌ماند.',
  'memory.researchNotes': 'یادداشت‌های تحقیقاتی',
  'memory.resetFilters': 'بازنشانی فیلترها',
  'memory.retrievalSurfacedASupersededExplanation': 'بازیابی توضیحی منسوخ را بیرون کشید',
  'memory.retrievedButNotTrusted': 'بازیابی‌شده اما مورد اعتماد نیست',
  'memory.rewordedToSeparateSmallSampleFromNoEdge':
    'بازنویسی شد تا «نمونه کوچک» از «بدون مزیت» جدا شود.',
  'memory.riskPerUnitComesFromTheStopDistance':
    'ریسک هر واحد از فاصله حد ضرر می‌آید، پس حجم از بودجه پیروی می‌کند. ترتیب مهم است: بودجه، حد ضرر، حجم — هرگز اول حجم.',
  'memory.roundingTheUnitCountUpInsteadOfDown': 'گرد کردن تعداد واحد به بالا به‌جای پایین',
  'memory.searchByTitleTagSourceReference': 'جست‌وجو بر پایهٔ عنوان، برچسب، ارجاع منبع',
  'memory.searchKnowledgeRecords': 'جست‌وجوی رکوردهای دانش',
  'memory.searchTheKnowledgeBase': 'جست‌وجو در پایگاه دانش',
  'memory.sep': 'سپتامبر',
  'memory.sessionCostAndMicrostructureConstraints': 'سشن، هزینه و محدودیت‌های ریزساختار',
  'memory.sessionOverlapChangesTheRealisedSpread': 'هم‌پوشانی سشن اسپرد محقق‌شده را تغییر می‌دهد',
  'memory.statedDrawdownToleranceDidNotMatchBehaviour':
    'تحمل افت سرمایه اعلام‌شده با رفتار مطابقت نداشت',
  'memory.supersededExplanationArchivedTheEntryStaysAsEvidence':
    'توضیح منسوخ بایگانی شد؛ این مدخل به‌عنوان شاهد باقی می‌ماند.',
  'memory.syntheticData': 'داده مصنوعی',
  'memory.syntheticNotRealMarketData': 'مصنوعی — داده بازار واقعی نیست',
  'memory.syntheticSeries': 'سری مصنوعی',
  'memory.theAgentSuggestedTighteningTheSessionFilterAnd':
    'عامل پیشنهاد داد فیلتر سشن سخت‌گیرانه‌تر شود و به هیچ سابقه ارزیابی ارجاع نداد. تأییدنشده نگه داشته می‌شود و به‌تنهایی نمی‌تواند دانش مورد اعتماد شود.',
  'memory.theCostOfEnteringDuringTheOverlapDiffers':
    'هزینه ورود در سشن هم‌پوشانی با سشن نازک دو طرف آن متفاوت است، پس یک پر شدن شبیه‌سازی‌شده باید سشنی که در آن رخ داده را حمل کند.',
  'memory.theRestIsUnverifiedOrAwaiting':
    'بقیه تأییدنشده‌اند یا در انتظار تأییدکننده‌ای غیر از مدل. هیچ‌چیز با استفاده کردن ارتقا نمی‌یابد.',
  'memory.theUserWroteItNoVerifierHasChecked':
    'خود کاربر آن را نوشته؛ هنوز هیچ تأییدکننده‌ای الگو را بررسی نکرده است.',
  'memory.theWrittenReviewDescribedTheSetupButNot':
    'بازبینی نوشته‌شده ستاپ را توصیف کرده بود اما سطحی که آن را غلط می‌کرد را نه، پس معامله پس از آن نمی‌توانست صادقانه بازبینی شود.',
  'memory.tombstonedRetainedAsEvidence': 'سنگ‌قبر شده و به‌عنوان شواهد نگه داشته شده',
  'memory.toolOutput': 'خروجی ابزار',
  'memory.tradingConcepts': 'مفاهیم معاملاتی',
  'memory.trustMix': 'ترکیب اعتماد',
  'memory.trustPolicy': 'سیاست اعتماد',
  'memory.trustStates': 'وضعیت‌های اعتماد',
  'memory.unverified': 'تأییدنشده',
  'memory.unverifiedWarning': 'هشدار تأییدنشده',
  'memory.updated': 'به‌روزرسانی',
  'memory.v': '· نسخهٔ',
  'memory.verificationIsRecorded': 'تأیید ثبت می‌شود',
  'memory.verified': 'تأییدشده',
  'memory.verifiedByAHumanReviewerOnlyAHuman':
    'توسط بازبین انسانی تأیید شد؛ فقط انسان می‌تواند اعتماد معتبر اعطا کند.',
  'memory.verifiedRecordsAtTheEndOf': 'رکورد تأییدشده در پایان این مجموعه',
  'memory.verifiedShare': 'سهم تأییدشده',
  'memory.whatKeepsTheKnowledgeBaseHonest': 'چه چیزی پایگاه دانش را صادق نگه می‌دارد',
  'memory.whatTheAgentConcludedUnverifiedUntilA':
    'آنچه عامل نتیجه گرفته — تأییدنشده تا زمانی که انسان یا ابزاری آن را بررسی کند',
  'memory.writtenFromTheMonth5ReadingNotes': 'از یادداشت‌های مطالعه ماه 5 نوشته شد.',
  // memoryCard ──────────────────────────────────────────────────
  'memoryCard.noMemoryServiceIsConnectedInThisPhase':
    'در این فاز هیچ سرویس حافظه‌ای متصل نیست، پس این کنش بی‌اثر است.',
  // memoryPage ──────────────────────────────────────────────────
  'memoryPage.aFreshlyStartedProfileHasNoRecordsThat':
    'یک پروفایل تازه‌شروع‌شده سابقه‌ای ندارد. این گفته می‌شود، نه با سطرهای جانگهدار پنهان.',
  'memoryPage.anEmptyResultStatesWhichFilterProducedIt':
    'یک نتیجه خالی می‌گوید کدام فیلتر آن را تولید کرده است.',
  'memoryPage.fourStatesEachWithWhatItMeansFor': 'چهار حالت، هر یک با معنایی که برای خواننده دارد.',
  'memoryPage.knowledgeBoard': 'تابلوی دانش',
  'memoryPage.knowledgeIsFiledByWhatItIsFor':
    'دانش بر اساس این‌که برای چه چیزی است بایگانی می‌شود، نه بر اساس زمان یادگیری‌اش.',
  'memoryPage.literalTextMatchingOverTheIllustrativeSetPlus':
    'تطبیق متن تحت‌اللفظی روی مجموعه نمونه‌وار، به‌علاوه فیلترهای اعتماد',
  'memoryPage.liveRecordsOnlyArchivedItemsAreKeptAnd':
    'فقط سوابق زنده؛ موارد بایگانی‌شده نگه داشته می‌شوند و زیر تاریخچه نشان داده می‌شوند.',
  'memoryPage.sourceKind': 'نوع منبع',
  'memoryPage.thePreviewFilterMatchesLiteralTextOnlySemantic':
    'فیلتر پیش‌نمایش فقط متن تحت‌اللفظی را تطبیق می‌دهد. بازیابی معنایی — امبدینگ‌ها، رتبه‌بندی و یادآوری فیلترشده بر اساس اعتماد — متصل نیست، پس نتیجه خالی اینجا به این معنا نیست که پایگاه دانش خالی است.',
  'memoryPage.trustState': 'وضعیت اعتماد',
  'memoryPage.unverifiedRecordsMayBeUsedAsContextBut':
    'سوابق تأییدنشده می‌توانند به‌عنوان بافت استفاده شوند، اما به‌عنوان عدم‌قطعیت برچسب می‌خورند و هرگز نمی‌توانند به‌عنوان واقعیت ارائه شوند.',
  'memoryPage.whatTheAgentMayUseWhereEachClaim':
    'آنچه عامل می‌تواند استفاده کند، هر ادعا از کجا آمده و چقدر قابل اعتماد است. بازیابی هرگز متن تأییدنشده را به واقعیت تبدیل نمی‌کند.',
  'memoryPage.whereTheRecordCameFromAnIndependent':
    'سابقه از کجا آمده — پرسشی مستقل از این‌که چقدر قابل اعتماد است',
  // memoryTimeline ──────────────────────────────────────────────
  'memoryTimeline.aRecordWithNoTimelineHasNeverBeen':
    'سابقه‌ای که خط زمانی ندارد هرگز بازنگری، تأیید یا حذف‌نشان نشده است.',
  'memoryTimeline.created': 'ایجاد شد',
  'memoryTimeline.revised': 'بازنگری شد',
  'memoryTimeline.tombstoned': 'حذف‌نشان شد',
  'memoryTimeline.trustRaised': 'اعتماد افزایش یافت',
  'memoryTimeline.verificationRequested': 'تأیید درخواست شد',
  // metricsPanel ────────────────────────────────────────────────
  'metricsPanel.aHighWinRateWithNegativeAverageR':
    'نرخ برد بالا با میانگین R منفی همچنان پول می‌بازد. عدد مهم، انتظار است.',
  'metricsPanel.confidenceDescribesTheSampleItIsNotA':
    'اطمینان نمونه را توصیف می‌کند. احتمالی درباره معامله بعدی نیست.',
  'metricsPanel.maxDrawdown': 'حداکثر افت سرمایه',
  'metricsPanel.metricsAppearOnceADeterministicEvaluationHasRun':
    'معیارها پس از اجرای یک ارزیابی قطعی روی مجموعه‌داده‌ای ثابت ظاهر می‌شوند. این آزمایش ارزیابی نشده، پس عددی برای نمایش وجود ندارد.',
  'metricsPanel.sampleSize': 'حجم نمونه',
  'metricsPanel.zeroesAreNeverShownInPlaceOfA':
    'صفرها هرگز به‌جای یک اندازه‌گیری غایب نشان داده نمی‌شوند.',
  // mistakeAnalysisCard ─────────────────────────────────────────
  'mistakeAnalysisCard.emptyIsStatedNotHidden': 'خالی گفته می‌شود، پنهان نمی‌شود.',
  'mistakeAnalysisCard.mistakePatternsAppearOnceAGradedAttemptHas':
    'الگوهای اشتباه پس از آن‌که یک تلاش تصحیح‌شده پاسخ‌های نادرست داشت ظاهر می‌شوند. تلاش تصحیح‌نشده تحلیلی تولید نمی‌کند.',
  // performanceChart ────────────────────────────────────────────
  'performanceChart.anEmptyChartIsLeftEmptyRatherThan':
    'نمودار خالی خالی رها می‌شود، نه با یک سری جایگزین پر می‌شود.',
  // portfolio ───────────────────────────────────────────────────
  'portfolio.aConcentrationFigureStatesHowMuch':
    'عدد تمرکز می‌گوید چه مقدار از ترکیب در یک جا نشسته است. این مشاهده‌ای است دربارهٔ آنچه اعلام کرده‌اید، نه توصیه‌ای برای تغییر آن، و هیچ نمی‌گوید که آن موقعیت خوب است یا نه.',
  'portfolio.aSingleCurrencySoThePriced': 'یک ارز، تا موقعیت‌های قیمت‌خورده در یک مجموع جمع شوند.',
  'portfolio.aVersionIsNeverRewrittenAn':
    'هیچ نسخه‌ای بازنویسی نمی‌شود. پس یک تحلیل همچنان به همان ترکیبی که از آن محاسبه شده قابل ردیابی است.',
  'portfolio.addPosition': 'افزودن موقعیت',
  'portfolio.blankStaysBlank': 'خالی خالی می‌ماند',
  'portfolio.byAssetClassFromMarketValues': 'بر پایهٔ کلاس دارایی، از ارزش‌های بازار',
  'portfolio.byCurrencySummedOnlyWithinEach': 'بر پایهٔ ارز، جمع‌شده تنها درون هر ارز',
  'portfolio.byDeclaredWeight': 'بر پایهٔ وزن اعلام‌شده',
  'portfolio.byMarketValue': 'بر پایهٔ ارزش بازار',
  'portfolio.changedBy': 'تغییر یافته به میزان',
  'portfolio.complete': 'کامل',
  'portfolio.concentration': 'تمرکز',
  'portfolio.costBasis': 'بهای تمام‌شده',
  'portfolio.couldNotReadThePortfolio': 'پرتفوی خوانده نشد',
  'portfolio.coverage': 'پوشش:',
  'portfolio.currenciesInTheDocument': 'ارزهای موجود در سند',
  'portfolio.dataQuality': 'کیفیت داده',
  'portfolio.decidedBy': 'تصمیم‌گیرنده',
  'portfolio.declareTheComposition': 'ترکیب را اعلام کنید',
  'portfolio.description':
    'ترکیبی که اعلام کرده‌اید، ارزش‌گذاری‌شده با کد قطعی — با نام بردن از هر شکاف، نه پر کردن آن.',
  'portfolio.dismiss': 'رد کردن',
  'portfolio.eGVOO': 'مثلاً VOO',
  'portfolio.engineVerdict': 'حکم موتور:',
  'portfolio.everyEarlierVersionIsKeptAnd':
    '. هر نسخهٔ پیشین نگه داشته می‌شود و بازنویسی نشده است.',
  'portfolio.everyFigureIsComputedOnThe': 'هر عدد روی سرور محاسبه می‌شود',
  'portfolio.everyFigureWasComputedOnThe':
    'هر عدد روی سرور و از آنچه اعلام کرده‌اید محاسبه شده است. خط تیره عددی است که وجود ندارد، و ستون یافته‌ها می‌گوید کدام نوع نبودن بوده است.',
  'portfolio.everyPositionDeclaredCarriesWhatA':
    'هر موقعیتی که اعلام شود، آنچه یک محاسبه لازم دارد را همراه دارد.',
  'portfolio.everyPositionValued': 'هر موقعیت ارزش‌گذاری شد',
  'portfolio.exposure': 'مواجهه',
  'portfolio.figureSNotProduced': 'عدد تولید نشد',
  'portfolio.findings': 'یافته‌ها',
  'portfolio.findingsWorstIs': 'یافته‌ها: بدترین مورد',
  'portfolio.fromDeclaredInputs': 'از ورودی‌های اعلام‌شده',
  'portfolio.largestShares': 'بزرگ‌ترین سهم‌ها',
  'portfolio.limitations': 'محدودیت‌ها',
  'portfolio.limitationsThisAnswerCarries': 'محدودیت‌هایی که این پاسخ با خود دارد',
  'portfolio.marketValue': 'ارزش بازار',
  'portfolio.measuredNotScored': 'سنجیده‌شده، نه نمره‌خورده',
  'portfolio.missingHoldingData': 'داده‌های ناقص موقعیت‌ها',
  'portfolio.moreThanOneCurrencyAndNo':
    'بیش از یک ارز و هیچ منبع نرخی وصل نیست، پس جمع‌ها گروه‌بندی می‌شوند نه تبدیل.',
  'portfolio.moreThanOneCurrencyAndNo2':
    'بیش از یک ارز و بدون منبع نرخ: گروه‌ها جداگانه گزارش می‌شوند، نه تبدیل‌شده به یک عدد.',
  'portfolio.newestFirst': 'تازه‌ترین اول',
  'portfolio.noConcentrationObservationWasMade': 'هیچ مشاهدهٔ تمرکزی انجام نشد',
  'portfolio.noExposureCanBeDescribedBecause':
    'هیچ مواجهه‌ای قابل توصیف نیست، چون هیچ موقعیتی ارزش‌گذاری نشد. چیزی جای آن نمایش داده نمی‌شود: سهم از مجموعی که وجود ندارد، سهم نیست.',
  'portfolio.noFindings': 'بدون یافته',
  'portfolio.noObservations': 'مشاهده‌ای نیست',
  'portfolio.noPopulationOfSharesCouldBe':
    'هیچ مجموعه‌ای از سهم‌ها شکل نگرفت، پس عدد تمرکزی وجود ندارد. پنل شکاف‌ها می‌گوید چه چیزی ناموجود است، به‌جای آنکه این کارت تمرکز صفر نشان دهد.',
  'portfolio.noPortfolioToShow': 'پرتفویی برای نمایش نیست',
  'portfolio.noPositionHasBothAQuantity':
    'هیچ موقعیتی هم‌زمان مقدار و قیمت جاری ندارد، پس ارزشی برای گزارش نیست.',
  'portfolio.noPositionsDeclared': 'هیچ موقعیتی اعلام نشده است',
  'portfolio.noPositionsToShow': 'موقعیتی برای نمایش نیست',
  'portfolio.noReadinessVerdictWasProducedSo':
    'حکم آمادگی تولید نشده است، پس هیچ ادعایی دربارهٔ اینکه تحلیلی می‌تواند اجرا شود مطرح نمی‌شود.',
  'portfolio.noSharesOfThisKindCould':
    'هیچ سهمی از این نوع شکل نگرفت، پس چیزی اینجا ترسیم نمی‌شود. این پاسخ صادقانه است، نه نموداری از صفرها: هر میله به معنای سنجه‌ای می‌بود که وجود ندارد.',
  'portfolio.noVersionHasBeenWrittenBecause':
    'هیچ نسخه‌ای نوشته نشده، چون برای این حساب ترکیبی اعلام نشده است.',
  'portfolio.notBuiltYet': 'هنوز ساخته نشده',
  'portfolio.notDeclaredYet': 'هنوز اعلام نشده',
  'portfolio.nothingHereIsValuedInThe':
    'هیچ‌چیز اینجا در مرورگر ارزش‌گذاری نمی‌شود و هیچ عددی همراه درخواست فرستاده نمی‌شود. سرور اعلام را ذخیره می‌کند، نسخه‌ای می‌افزاید و هر عدد را از آن محاسبه می‌کند.',
  'portfolio.nothingInThisPopulationCouldBe':
    'هیچ‌چیز در این مجموعه قابل گروه‌بندی نبود، پس تفکیکی برای نمایش نیست.',
  'portfolio.nothingIsMissingEveryFigureThese':
    'چیزی ناموجود نیست: هر عددی که این دامنه‌ها می‌خواهند از آنچه اعلام شده قابل تولید بود.',
  'portfolio.nothingIsStoredYet': 'هنوز چیزی ذخیره نشده است',
  'portfolio.observationS': 'مشاهده',
  'portfolio.observed': 'مشاهده‌شده',
  'portfolio.ofTheDeclaredDocumentAShare':
    'از سند اعلام‌شده. سهم در اینجا تنها سهم از همین مجموعه است — هرگز سهم از آمیخته‌ای از وزن‌های اعلامی و ارزش‌های بازار.',
  'portfolio.partialValuation': 'ارزش‌گذاری جزئی',
  'portfolio.portfolioReadiness': 'آمادگی پرتفوی',
  'portfolio.portfolioSections': 'بخش‌های پرتفوی',
  'portfolio.portfolioValue': 'ارزش پرتفوی',
  'portfolio.position': 'موقعیت',
  'portfolio.position2': 'موقعیت',
  'portfolio.positions': 'موقعیت‌ها',
  'portfolio.price': 'قیمت',
  'portfolio.priceFreshness': 'تازگی قیمت',
  'portfolio.quantity': 'مقدار',
  'portfolio.replacesTheCurrentVersion': 'نسخهٔ جاری را جایگزین می‌کند',
  'portfolio.scopeSBlocked': 'دامنهٔ مسدودشده',
  'portfolio.theDeclarationWasNotStored': 'اعلام ذخیره نشد',
  'portfolio.theDeclarationWasRejectedByThe': 'اعلام از سوی سرور رد شد:',
  'portfolio.theDeclarationWasStoredAsVersion': 'اعلام به‌عنوان نسخهٔ',
  'portfolio.theDocumentDeclaresMorePositionsThan':
    'سند بیش از آنچه موتور یک‌بار می‌خواند موقعیت اعلام می‌کند، پس تنها نخستین موقعیت‌ها استفاده شدند. بقیه خاموشانه وارد نشدند.',
  'portfolio.theEngineProducedNoInsightFor':
    'موتور برای این ترکیب یافته‌ای تولید نکرد. این تندرستی کامل نیست: یعنی چیزی نبود که بتواند مشاهده کند — بیشتر به این دلیل که برای وجود یک عدد، اعلام‌های بسیار کمی وجود داشته است. پنل شکاف‌ها می‌گوید آن عددها کدام‌اند.',
  'portfolio.thePricedPositionsAreNotAll':
    'موقعیت‌های قیمت‌خورده همه در یک ارز نیستند، پس مجموع واحدی تولید نمی‌شود. هر ارز جداگانه گزارش می‌شود: تبدیل آن‌ها نرخ می‌خواهد و هیچ منبع نرخی وصل نیست.',
  'portfolio.theTwoLayersOfTheSame':
    'دو لایه از یک حکم، جداگانه نمایش داده می‌شوند: آنچه زمینهٔ اعلامی شما اجازه می‌دهد، و آنچه سند پشتیبانی می‌کند.',
  'portfolio.theWorseOfTwoReadingsDecides': 'بدترینِ دو خوانش تصمیم می‌گیرد',
  'portfolio.thisIsNotAPortfolioWorth':
    'این یک پرتفوی بی‌ارزش نیست — ترکیبی است که محصول هنوز نمی‌تواند ارزش‌گذاری کند. صفر در اینجا ادعایی واقعی می‌بود، و همین دلیل نمایش‌ندادنش است.',
  'portfolio.total': 'جمع',
  'portfolio.twoPopulationsAreShownBecauseBoth':
    'دو مجموعه نمایش داده می‌شود چون هر دو شکل می‌گیرند. هر جا ناسازگار باشند، تفاوت میان آنچه اعلام کرده‌اید و آنچه قیمت‌ها می‌گویند است — نه خطایی در هیچ‌یک.',
  'portfolio.unrealisedPL': 'سود و زیان تحقق‌نیافته',
  'portfolio.version': 'نسخه',
  'portfolio.versionHistory': 'تاریخچهٔ نسخه‌ها',
  'portfolio.versionSShown': 'نسخه نمایش داده شد',
  'portfolio.weight': 'وزن',
  'portfolio.whatTheseFiguresRestOn': 'این عددها بر چه چیزی استوارند',
  'portfolio.whatThisRestsOn': 'این بر چه چیزی استوار است',
  'portfolio.whatWouldUnblockIt': 'چه چیزی آن را باز می‌کند',
  'portfolio.worst': 'بدترین:',
  // portfolioOverview ───────────────────────────────────────────
  'portfolioOverview.costBasisKnown': 'بهای تمام‌شده شناخته‌شده',
  'portfolioOverview.everythingInTheDocumentAsStored':
    'همه چیز موجود در سند، همان‌گونه که ذخیره شده است',
  'portfolioOverview.positionWithAQuantityAndAnEntryPrice': 'پوزیشن با مقدار و قیمت ورود',
  'portfolioOverview.positionWithAUsableQuantityAndPrice': 'پوزیشن با مقدار و قیمت قابل استفاده',
  'portfolioOverview.positionsACalculationCouldReadAtAll':
    'پوزیشن‌هایی که یک محاسبه اصلاً می‌تواند بخواند',
  'portfolioOverview.positionsDeclared': 'پوزیشن‌های اعلام‌شده',
  'portfolioOverview.priced': 'قیمت‌دار',
  'portfolioOverview.usable': 'قابل استفاده',
  // portfolioPage ───────────────────────────────────────────────
  'portfolioPage.allocation': 'تخصیص',
  'portfolioPage.declare': 'اعلام',
  'portfolioPage.holdings': 'دارایی‌ها',
  'portfolioPage.nothingHasBeenDeclaredForThisAccountSo':
    'چیزی برای این حساب اعلام نشده، پس چیزی برای ارزش‌گذاری نیست. برگه اعلام را باز کنید تا ترکیب را توصیف کنید — یک مقدار، یک قیمت، یک سهم اعلام‌شده، یا هر ترکیبی از این سه.',
  'portfolioPage.quality': 'کیفیت',
  'portfolioPage.savingHereCreatesVersion1OfTheDeclaration':
    'ذخیره اینجا نسخه ۱ اعلام را می‌سازد. هر ذخیره بعدی یک نسخه اضافه می‌کند؛ هیچ‌یک نسخه پیشین را بازنویسی نمی‌کند.',
  // portfolioPanels ─────────────────────────────────────────────
  'portfolioPanels.aDeclaredShareExists': 'سهم اعلام‌شده‌ای وجود دارد',
  'portfolioPanels.afterTheBoundIsApplied': 'پس از اعمال محدودیت',
  'portfolioPanels.costed': 'بهای تمام‌شده محاسبه‌شده',
  'portfolioPanels.declaredWeightSum': 'جمع وزن اعلام‌شده',
  'portfolioPanels.notMalformed': 'بدشکل نیست',
  'portfolioPanels.positionsRead': 'پوزیشن‌های خوانده‌شده',
  'portfolioPanels.quantityAndEntryPriceBothUsable': 'مقدار و قیمت ورود هر دو قابل استفاده',
  'portfolioPanels.quantityAndPriceBothUsable': 'مقدار و قیمت هر دو قابل استفاده',
  'portfolioPanels.sharesAreMeantToAddUpToA': 'سهم‌ها باید جمعاً یک کل پرتفوی را بسازند',
  'portfolioPanels.weighted': 'وزن‌دار',
  // portfolioValueCard ──────────────────────────────────────────
  'portfolioValueCard.ofTheDeclaredWeightsHowMuchThePriced':
    'از وزن‌های اعلام‌شده، سهمی که پوزیشن‌های قیمت‌دار پوشش می‌دهند',
  'portfolioValueCard.pricedShare': 'سهم قیمت‌دار',
  'portfolioValueCard.unrealisedReturn': 'بازده محقق‌نشده',
  // profile ─────────────────────────────────────────────────────
  'profile.addConstraint': 'افزودن محدودیت',
  'profile.addHolding': 'افزودن دارایی',
  'profile.analysisReadiness': 'آمادگی تحلیل',
  'profile.answer': 'پاسخ',
  'profile.areTheExamplesUsedInThis': 'نمونه‌هایی هستند که در این توضیح به کار رفته‌اند.',
  'profile.array.10k-50k': '۱۰٫۰۰۰ – ۵۰٫۰۰۰',
  'profile.array.1k-10k': '۱٫۰۰۰ – ۱۰٫۰۰۰',
  'profile.array.50k-250k': '۵۰٫۰۰۰ – ۲۵۰٫۰۰۰',
  'profile.array.advanced': 'پیشرفته',
  'profile.array.balanced': 'متعادل',
  'profile.array.beginner': 'مبتدی',
  'profile.array.capital-preservation': 'حفظ سرمایه',
  'profile.array.chart-reading': 'خواندن نمودار',
  'profile.array.commodity': 'مواد پایه',
  'profile.array.crypto': 'ارز دیجیتال',
  'profile.array.day-trading': 'معاملهٔ روزانه',
  'profile.array.equity': 'سهام',
  'profile.array.fx': 'ارز خارجی',
  'profile.array.growth-oriented': 'رشدمحور',
  'profile.array.index': 'شاخص‌ها',
  'profile.array.intermediate': 'متوسط',
  'profile.array.journaling-review': 'یادداشت‌نویسی و بازبینی',
  'profile.array.market-structure': 'ساختار بازار',
  'profile.array.over-250k': 'بیش از ۲۵۰٫۰۰۰',
  'profile.array.position': 'معاملهٔ موقعیتی',
  'profile.array.prefer-not-to-say': 'ترجیح می‌دهم نگویم',
  'profile.array.psychology-discipline': 'روان‌شناسی و انتظام',
  'profile.array.risk-management': 'مدیریت ریسک',
  'profile.array.scalping': 'اسکالپ',
  'profile.array.strategy-development': 'توسعهٔ استراتژی',
  'profile.array.swing': 'معاملهٔ سوینگ',
  'profile.array.under-1k': 'کمتر از ۱٫۰۰۰',
  'profile.array.unspecified': 'ترجیح می‌دهم نگویم',
  'profile.assessingTheDeclaredInputs': 'سنجش ورودی‌های اعلام‌شده',
  'profile.assumed': 'فرض‌شده',
  'profile.assumed2': 'فرض‌شده ·',
  'profile.boundariesYouWantRespectedInYour':
    'مرزهایی که می‌خواهید در معامله‌گری‌تان رعایت شود، به زبان خودتان. یک ترجیح، نه دستوری برای معامله — هر چیزی که بوی سفارش بدهد هنگام ذخیره رد می‌شود.',
  'profile.confirmed': 'تأییدشده',
  'profile.confirmed2': 'تأییدشده ·',
  'profile.constraintsAndPreferences': 'محدودیت‌ها و ترجیح‌ها',
  'profile.contextCompleteness': 'کاملی زمینه',
  'profile.contextHistory': 'تاریخچهٔ زمینه',
  'profile.couldNotAssessTheDeclaredInputs': 'ورودی‌های اعلام‌شده سنجیده نشد',
  'profile.couldNotReadTheProfile': 'پروفایل خوانده نشد',
  'profile.declarationsThatDoNotFitTogether': 'اعلام‌هایی که با هم سازگار نیستند',
  'profile.declaredByYou': 'اعلام‌شده توسط شما',
  'profile.declaredContext': 'زمینهٔ اعلام‌شده',
  'profile.derived': 'استخراج‌شده ·',
  'profile.deterministicChecksOverWhatYouHave':
    'بررسی‌های قطعی روی آنچه اعلام کرده‌اید و آنچه هر قابلیت می‌گوید نیاز دارد. هیچ مدل زبانی مشورت نمی‌شود.',
  'profile.eURUSDAAPLBTCUSD': 'EURUSD، AAPL، BTCUSD',
  'profile.everyRequiredFieldIsCurrent': 'هر فیلد لازم به‌روز است',
  'profile.everyRequiredFieldIsCurrentThe':
    'هر فیلد لازم به‌روز است. قابلیت‌های تحلیلی می‌توانند به پرسش‌هایی که این ورودی‌ها پشتیبانی می‌کنند پاسخ دهند.',
  'profile.everyValueIsLabelledWithWhere':
    'هر مقدار برچسب دارد که از کجا آمده و آیا هنوز به‌روز است.',
  'profile.existingHoldings': 'دارایی‌های موجود',
  'profile.fieldLabels': 'برچسب فیلدها:',
  'profile.fieldSOpen': 'فیلد باز',
  'profile.fieldsTheValueItsSourceAnd':
    'فیلد. مقدار، منبع و سن آن با هم نمایش داده می‌شوند، چون مقدار بدون منبع مقداری است که نمی‌توانید بسنجید.',
  'profile.howToReadThisPage': 'این صفحه را چگونه بخوانیم',
  'profile.learningGoals': 'هدف‌های یادگیری',
  'profile.marketDataForThisDeployment': 'دادهٔ بازار این استقرار:',
  'profile.mayBeOutdated': 'ممکن است قدیمی باشد',
  'profile.mayBeOutdated2': 'ممکن است قدیمی باشد ·',
  'profile.mayEachAnalysisRunAndIn': 'هر تحلیل می‌تواند اجرا شود، و به چه شکل؟',
  'profile.missing': 'ناموجود',
  'profile.missing2': 'ناموجود',
  'profile.noHoldingsDescribedAnalysisThatDepends':
    'دارایی‌ای توصیف نشده است. تحلیلی که به آن‌ها وابسته باشد همین را می‌گوید.',
  'profile.noProfileToShowYet': 'هنوز پروفایلی برای نمایش نیست',
  'profile.noSinglePositionAbove10Of': 'هیچ موقعیت واحدی بیش از ۱۰٪ پرتفوی',
  'profile.noVersionsYet': 'هنوز نسخه‌ای نیست',
  'profile.notProvided': 'ارائه نشده',
  'profile.notProvidedItIsNeverTreated':
    '— ارائه نشده. هرگز به‌عنوان واقعیت تلقی نمی‌شود و هرگز پیش‌پرشده در ویرایشگر ظاهر نمی‌شود.',
  'profile.note': 'یادداشت:',
  'profile.nothingIsStoredCapabilitiesThatNeed':
    '— چیزی ذخیره نمی‌شود. قابلیت‌هایی که به آن نیاز دارند می‌پرسند، یا محدود می‌مانند و دلیلش را می‌گویند.',
  'profile.nothingOutstanding': 'چیزی معلق نیست',
  'profile.observed': 'مشاهده‌شده',
  'profile.onlyWhatYouTellUsIs':
    'تنها آنچه خودتان می‌گویید به‌عنوان واقعیت ذخیره می‌شود. هر چیزی که خالی بماند ناموجود می‌ماند و دربارهٔ آن پرسیده می‌شود، نه حدس زده.',
  'profile.optional': 'اختیاری',
  'profile.optionalAndByPercentageOnlyThere':
    'اختیاری، و تنها به درصد. فیلدی برای مقدار، قیمت یا بهای تمام‌شده وجود ندارد — توصیف یک تخصیص لازم نیست سند مالی باشد.',
  'profile.preferredMarkets': 'بازارهای ترجیحی',
  'profile.profile': 'پروفایل',
  'profile.profileSections': 'بخش‌های پروفایل',
  'profile.reason.assumed': 'فرض شده، نه اعلام‌شده',
  'profile.reason.missing': 'ارائه نشده',
  'profile.reason.stale': 'ممکن است قدیمی باشد',
  'profile.requiredFields': 'فیلدهای لازم',
  'profile.shareOfTheFieldsTheAnalysis':
    'سهم فیلدهایی که قابلیت‌های تحلیلی لازم دارند و مقداری دارند که واقعاً به ما داده‌اید. فیلدهای ناموجود پرسیده می‌شوند و هرگز پر نمی‌شوند.',
  'profile.someContextIsStillMissing': 'بخشی از زمینه هنوز ناموجود است',
  'profile.source.assumed': 'اعلام نشده — تنها فرض',
  'profile.source.derived': 'محاسبه‌شده از آنچه اعلام کردید',
  'profile.source.user-stated': 'خودتان گفتید',
  'profile.status.assumed': 'فرض‌شده',
  'profile.status.confirmed': 'تأییدشده',
  'profile.status.derived': 'استخراج‌شده',
  'profile.status.missing': 'ناموجود',
  'profile.status.stale': 'ممکن است قدیمی باشد',
  'profile.status2.assumed':
    'از سوی شما ارائه نشده. تنها می‌تواند به‌عنوان فرض به کار رود، هرگز به‌عنوان واقعیت.',
  'profile.status2.confirmed': 'خودتان این را گفتید و در بازهٔ تازگی خود قرار دارد.',
  'profile.status2.derived': 'از مقادیر دیگری که داده‌اید محاسبه شده، نه اعلام مستقیم.',
  'profile.status2.missing': 'ارائه نشده. سامانه می‌پرسد و آن را از خود پر نمی‌کند.',
  'profile.status2.stale': 'خودتان این را گفتید، اما از بازهٔ تازگی این نوع ورودی گذشته است.',
  'profile.theAssessmentFailed': 'سنجش شکست خورد',
  'profile.theContextWasNotSaved': 'زمینه ذخیره نشد',
  'profile.theSameGateTheAgentConsults':
    'همان دروازه‌ای که دستیار پیش از سپردن استدلال به مدل بررسی می‌کند. اینجا از زمینهٔ ذخیره‌شده و روی سرور ارزیابی می‌شود، پس پاسخی که می‌خوانید و پاسخی که دستیار بر پایهٔ آن عمل می‌کند یکی است.',
  'profile.theSessionHasNotBeenResolvedYet': 'نشست هنوز شناسایی نشده است.',
  'profile.theseAreAskedRatherThanDefaulted':
    'دربارهٔ این‌ها پرسیده می‌شود و پیش‌فرضی جایشان نمی‌نشیند. اگر ترجیح می‌دهید پاسخ ندهید، تحلیل محدود می‌ماند و می‌گوید کدام ورودی ناموجود است.',
  'profile.theseAreSurfacedAsQuestionsNot':
    'این‌ها به‌صورت پرسش مطرح می‌شوند، نه با انتخاب یک سو به‌جای شما.',
  'profile.total': 'جمع',
  'profile.tradingPreferences': 'ترجیح‌های معاملاتی',
  'profile.untilTheseAreAnsweredCapabilitiesThat':
    'تا وقتی به این‌ها پاسخ داده نشود، قابلیت‌هایی که به آن‌ها نیاز دارند تحلیلی محدود تولید می‌کنند یا از دقیق بودن سر باز می‌زنند، به‌جای آنکه پیش‌فرضی جای آن بگذارند.',
  'profile.versionsAreAppendOnlyASave':
    'نسخه‌ها فقط‌افزودنی‌اند. هر ذخیره یک نسخه می‌افزاید؛ هیچ‌چیز بازنویسی نمی‌شود، پس زمینه‌ای که پاسخی از آن داده شده قابل بازیابی می‌ماند.',
  'profile.weakestRequiredField': 'ضعیف‌ترین فیلد لازم',
  'profile.whatIStillNeedFromYou': 'آنچه هنوز از شما لازم دارم',
  'profile.youToldUsThisButIt': '— خودتان این را گفتید، اما از بازهٔ این نوع ورودی گذشته است.',
  'profile.youToldUsThisInsideIts': '— خودتان این را گفتید و در بازهٔ تازگی خود قرار دارد.',
  // profileEditor ───────────────────────────────────────────────
  'profileEditor.aBandNeverAnAmountThereIsNo':
    'یک بازه، هرگز یک مبلغ: اینجا هیچ فیلدی برای مانده حساب وجود ندارد.',
  'profileEditor.capitalRange': 'بازه سرمایه',
  'profileEditor.commaSeparatedOptionalLeaveBlankIfYou':
    'جداشده با کاما. اختیاری — اگر ترجیح می‌دهید فهرست نکنید، خالی بگذارید.',
  'profileEditor.declaredByYouTheSystemNeverAssignsOne':
    'اعلام‌شده توسط شما. سیستم هرگز یکی تعیین نمی‌کند و «ترجیح می‌دهم نگویم» پاسخی معتبر است.',
  'profileEditor.experienceLevel': 'سطح تجربه',
  'profileEditor.horizon': 'افق زمانی',
  'profileEditor.howMuchTradingExperienceYouWouldSayYou':
    'اینکه به نظر خودتان چقدر تجربه معاملاتی دارید.',
  'profileEditor.overWhatHorizonYouUsuallyHoldAPosition':
    'معمولاً یک پوزیشن را در چه افق زمانی نگه می‌دارید.',
  'profileEditor.preferredInstruments': 'ابزارهای ترجیحی',
  'profileEditor.primaryTimeframe': 'تایم‌فریم اصلی',
  'profileEditor.riskTolerance': 'تحمل ریسک',
  'profileEditor.tradingStyle': 'سبک معاملاتی',
  // profilePage ─────────────────────────────────────────────────
  'profilePage.nothingIsInferredToFillTheGapThe':
    'هیچ چیزی برای پر کردن شکاف استنتاج نمی‌شود: فیلدها خالی می‌مانند و تحلیل متأثر محدود باقی می‌ماند.',
  'profilePage.preferences': 'ترجیحات',
  'profilePage.savingPreferencesCreatesTheFirstVersionOfYour':
    'ذخیره ترجیحات نخستین نسخه بافت شما را می‌سازد.',
  'profilePage.theAgentMayOnlyUseYourDeclaredContext':
    'عامل فقط می‌تواند بافت اعلام‌شده شما را به‌عنوان ورودی استفاده کند. هرگز در آن نمی‌نویسد و هرگز یک خالی را با پیش‌فرض پر نمی‌کند.',
  'profilePage.yourDeclaredTradingContextWhatYouHaveTold':
    'بافت معاملاتی اعلام‌شده شما: آنچه به Master Trade گفته‌اید، و آنچه هنوز باز است.',
  // quality ─────────────────────────────────────────────────────
  'quality.assessed': 'سنجیده‌شده',
  'quality.blocking': 'بازدارنده',
  'quality.code.allocation-exceeds-portfolio': 'تخصیص از کل پرتفوی بیشتر است',
  'quality.code.assumed-value': 'ارائه نشده — به‌عنوان فرض تلقی شد',
  'quality.code.conflicting-declarations': 'دو اعلام که هم‌زمان نمی‌توانند درست باشند',
  'quality.code.constraint-is-instruction': 'به‌صورت دستور نوشته شده، نه محدودیت',
  'quality.code.duplicate-entry': 'ورودی تکراری',
  'quality.code.empty-list': 'فهرست خالی',
  'quality.code.malformed-symbol': 'نماد ناسالم',
  'quality.code.missing-helpful': 'تحلیل را دقیق‌تر می‌کند',
  'quality.code.missing-provenance': 'هیچ منشأیی ثبت نشده است',
  'quality.code.missing-required': 'لازم است و ارائه نشده',
  'quality.code.negative-value': 'مقدار منفی',
  'quality.code.non-finite-number': 'عدد متناهی نیست',
  'quality.code.not-a-number': 'عدد نیست',
  'quality.code.out-of-range': 'بیرون از بازهٔ خود',
  'quality.code.risk-horizon-tension': 'ریسک و افق زمانی در دو جهت متفاوت‌اند',
  'quality.code.stale-value': 'از بازهٔ تازگی خود گذشته است',
  'quality.code.unavailable-input': 'ورودی در دسترس نیست',
  'quality.code.undated-claim': 'بدون زمان مشاهده اعلام شده است',
  'quality.code.unknown-token': 'یکی از مقادیر پشتیبانی‌شده نیست',
  'quality.code.unsupported-market': 'بازاری که سامانه در آن کار نمی‌کند',
  'quality.code.unsupported-timeframe': 'بازهٔ زمانی‌ای که سامانه در آن کار نمی‌کند',
  'quality.code.untrusted-provenance': 'منشأ قابل راستی‌آزمایی نیست',
  'quality.dimension.completeness': 'کامل بودن',
  'quality.dimension.confidence': 'اعتماد',
  'quality.dimension.consistency': 'سازگاری',
  'quality.dimension.freshness': 'تازگی',
  'quality.dimension.provenance': 'منشأ',
  'quality.dimension.relevance': 'مرتبط بودن',
  'quality.dimension.reliability': 'اتکاپذیری',
  'quality.dimension.validity': 'اعتبار',
  'quality.dimensions': 'ابعاد',
  'quality.everyInputTheSystemCanCurrently':
    'هر ورودی‌ای که سامانه اکنون می‌تواند دربارهٔ آن بپرسد حاضر و قابل استفاده است. این ادعا نیست که پاسخ کامل خواهد بود — تنها یعنی هیچ الزام اعلام‌شده‌ای ناموجود نمی‌ماند.',
  'quality.findingsBehindThisVerdict': 'یافته‌های پشت این حکم',
  'quality.howGoodAreTheDeclaredInputs': 'ورودی‌های اعلام‌شده چقدر خوب‌اند؟',
  'quality.inputQualitySummary': 'خلاصهٔ کیفیت ورودی',
  'quality.inputSMissing': 'ورودی ناموجود',
  'quality.inputsThatAreMissing': 'ورودی‌هایی که ناموجودند',
  'quality.limitationsThisAnswerWouldCarry': 'محدودیت‌هایی که این پاسخ با خود خواهد داشت',
  'quality.missingInformation': 'اطلاعات ناموجود',
  'quality.noProvenanceRecorded': 'هیچ منشأیی ثبت نشده است',
  'quality.noScoreVerdictsAndNamedCounts': 'بدون امتیاز — تنها حکم‌ها و شمارش‌های نام‌دار',
  'quality.nothingRequiredIsMissing': 'هیچ الزام لازمی ناموجود نیست',
  'quality.origin.system': 'جانشینی سامانه — رد شد',
  'quality.origin.user-premise': 'خودتان این مقدمه را اعلام کردید',
  'quality.questionS': 'پرسش',
  'quality.reason.assumed': 'فعلاً یک فرض',
  'quality.reason.conflicting': 'با پاسخ دیگری در تناقض است',
  'quality.reason.missing': 'هنوز ارائه نشده',
  'quality.reason.refused-to-say': 'شما ترجیح دادید نگویید',
  'quality.reason.stale': 'قدیمی است',
  'quality.recorded': 'ثبت‌شده',
  'quality.source.derived': 'استخراج‌شده',
  'quality.source.market-data': 'دادهٔ بازار',
  'quality.source.system': 'سامانه',
  'quality.source.user': 'شما',
  'quality.substitutionsAndPremises': 'جانشینی‌ها و مقدمه‌ها',
  'quality.theInputsWereAssessedAndThe':
    'ورودی‌ها سنجیده شدند و این حکم پابرجاست. این قابلیت هنوز ساخته نشده است، پس تحلیلی تولید نمی‌شود — این شکافی در محصول است، نه مشکلی در ورودی‌های شما.',
  'quality.trust.authoritative':
    'یک منبع مرجع: سامانه آن را مستقیم خوانده است، نه اینکه از کسی شنیده باشد.',
  'quality.trust.unverified':
    'چیزی فراتر از خود این ادعا تأییدکنندهٔ آن نیست، پس نمی‌تواند کامل سنجیده شود.',
  'quality.trust.verified': 'با منبعی که سامانه می‌تواند نشانش دهد تأیید شده است.',
  'quality.validationFindings': 'یافته‌های اعتبارسنجی',
  'quality.whatCanStillBeAnalysed': 'چه چیزی هنوز قابل تحلیل است',
  'quality.whatIsNotKnownYet': 'چه چیزی هنوز دانسته نیست',
  'quality.why': 'چرا:',
  'quality.wouldSharpenTheAnswer': 'پاسخ را دقیق‌تر می‌کند',
  'quality.youHaveNotDeclaredATrading':
    'هنوز زمینهٔ معاملاتی‌ای اعلام نکرده‌اید، پس هر ورودی زیر به‌حق غایب است. این گزارش همان زمینهٔ خالی را توصیف می‌کند، نه فهرستی از کارهایی که اشتباه کرده‌اید.',
  // questionPanel ───────────────────────────────────────────────
  'questionPanel.theAnswerKeyNeverReachesTheClientBefore':
    'کلید پاسخ پیش از ارسال هرگز به کلاینت نمی‌رسد؛ تصحیح سمت سرور و بر اساس روبریک انجام می‌شود.',
  // realtime ────────────────────────────────────────────────────
  'realtime.1284RowsAccepted12RejectedForAMissing':
    '1,284 سطر پذیرفته شد؛ 12 سطر برای نبود برچسب زمانی رد شد. سطرهای ردشده فهرست می‌شوند، هرگز بی‌صدا حذف نمی‌شوند.',
  'realtime.1Fact1Analysis1UncertaintyChainOfThought':
    '1 واقعیت، 1 تحلیل، 1 عدم‌قطعیت — زنجیره فکر هرگز منتشر نمی‌شود.',
  'realtime.aLifecycleTransitionTheTurnIsNotFinished':
    'یک گذار چرخه عمر. نوبت تا رسیدن خلاصه تمام نمی‌شود.',
  'realtime.aProposedRuleIsWaitingForYourDecision': 'یک قاعده پیشنهادی در انتظار تصمیم شماست',
  'realtime.activity': 'فعالیت',
  'realtime.activityPreviewNotice':
    'پیش‌نمایش رابط — تنها دادهٔ نمونه، بدون بک‌اند و بدون هوش مصنوعی.',
  'realtime.agentActivity': 'فعالیت دستیار',
  'realtime.answerRiskPerTradeFollowsFromTheStop':
    'پاسخ: ریسک هر معامله از فاصله حد ضرر می‌آید، نه از اندازه پوزیشن.',
  'realtime.attempt': 'تلاش',
  'realtime.attempts': 'تلاش‌ها',
  'realtime.backgroundTasks': 'کارهای پس‌زمینه',
  'realtime.cancelledByTheUserBeforeTheFirstSection': 'پیش از نوشتن نخستین بخش توسط کاربر لغو شد',
  'realtime.cancellingRecordsWhoAskedInThe':
    'لغو کردن ثبت می‌کند چه کسی درخواست کرده است. آغاز کردن کار اینجا پیشنهاد نمی‌شود: کارهای پس‌زمینه توسط سرور و زیر دروازهٔ مجوز و تأیید خودش در صف گذاشته می‌شوند.',
  'realtime.clearThisList': 'پاک کردن این فهرست',
  'realtime.completed': 'کامل‌شده ·',
  'realtime.correlation': 'همبستگی',
  'realtime.correlation2': 'همبستگی',
  'realtime.datasetValidated': 'مجموعه‌داده اعتبارسنجی شد',
  'realtime.entries': 'ورودی',
  'realtime.eventsDelivered': 'رویدادهای تحویل‌شده',
  'realtime.from': 'از',
  'realtime.ingestionIsPausedAndWillRetryWithBackoff':
    'دریافت داده متوقف شده و با عقب‌نشینی تدریجی دوباره تلاش می‌کند. تا زمان قطعی هیچ داده زنده‌ای ادعا نمی‌شود.',
  'realtime.jobPreviewNotice':
    'داده‌های نمونه: این رکوردهای کار، نمونه‌های ایستا از ساختار صف هستند. در این پیش‌نمایش هیچ کارگری در حال اجرا نیست.',
  'realtime.keepItRunning': 'در حال اجرا نگهش دار',
  'realtime.lesson4Of6CompleteInPositionSizing':
    'درس 4 از 6 در «اندازه پوزیشن و ریسک نابودی» کامل شد.',
  'realtime.marketDataIngestFailedPROVIDERUNAVAILABLE':
    'marketData.ingest ناموفق: PROVIDER_UNAVAILABLE.',
  'realtime.marketDataProviderUnavailable': 'ارائه‌دهنده داده بازار در دسترس نیست',
  'realtime.nextAttemptInAbout': 'تلاش بعدی در حدود',
  'realtime.pROVIDERUNAVAILABLETheSyntheticProviderFixtureIsNotR':
    'PROVIDER_UNAVAILABLE: فیکسچر ارائه‌دهنده مصنوعی در حال اجرا نیست.',
  'realtime.previewNotice':
    'داده‌های نمونه: نمونه‌ای قطعی از آنچه جریان حمل می‌کند، نه یک اتصال زنده.',
  'realtime.progressOnlyTheJobIsStillRunning': 'فقط پیشرفت؛ کار همچنان در حال اجرا است.',
  'realtime.provenance': 'منشأ:',
  'realtime.queued': 'در صف ·',
  'realtime.reasonOptional': 'دلیل (اختیاری)',
  'realtime.reconnectS': 'اتصال دوباره',
  'realtime.reportedUnit': 'واحد اعلام‌شده:',
  'realtime.retryingWillNotHelpUntilThis': 'تا وقتی این تغییر نکند، تلاش دوباره کمکی نمی‌کند.',
  'realtime.running': 'در حال اجرا ·',
  'realtime.s': 'ثانیه.',
  'realtime.staleDropped': 'کهنه، حذف شد',
  'realtime.status.cancelled': 'لغو‌شده',
  'realtime.status.dead-letter': 'پس از تمام شدن تلاش‌ها متوقف شد',
  'realtime.status.failed': 'ردشده — تلاش دوباره خواهد شد',
  'realtime.status.queued': 'در صف',
  'realtime.status.running': 'در حال اجرا',
  'realtime.status.succeeded': 'کامل‌شده',
  'realtime.stopThisTask': 'این کار را متوقف کن',
  'realtime.stopped': 'متوقف‌شده',
  'realtime.theEvaluationFinishedButActivationNeedsARecorded':
    'ارزیابی تمام شد، اما فعال‌سازی به یک تأیید انسانی ثبت‌شده نیاز دارد. سیستم نمی‌تواند پیشنهاد خودش را بپذیرد.',
  'realtime.theJobListCouldNotBe': 'فهرست کارها خوانده نشد',
  'realtime.theQueueCannotBeRead': 'صف خوانده نمی‌شود',
  'realtime.theServerIsShuttingDownRetryingIn08s':
    'سرور در حال خاموش شدن است. تلاش دوباره در 0.8 ثانیه (تلاش 2).',
  'realtime.theseArePreviewRecords': 'این‌ها رکوردهای پیش‌نمایش‌اند',
  'realtime.thisTaskCanNoLongerBe': 'این کار دیگر قابل توقف نیست',
  'realtime.typedCodeNoStackTraceNoProviderPayload':
    'کد تایپ‌شده، بدون stack trace، بدون داده ارائه‌دهنده.',
  'realtime.unreadableDropped': 'ناخوانا، حذف شد',
  // reportViewer ────────────────────────────────────────────────
  'reportViewer.noResearchServiceIsConnectedInThisPhase':
    'در این فاز هیچ سرویس تحقیقاتی متصل نیست، پس خروجی‌گرفتن بی‌اثر است.',
  'reportViewer.reportsAreAssembledFromStoredEvaluationRowsOnce':
    'گزارش‌ها پس از وجود ارزیابی، از سطرهای ارزیابی ذخیره‌شده ساخته می‌شوند.',
  // research ────────────────────────────────────────────────────
  'research.a465WinRateWithPositiveAverageR':
    'نرخ برد 46.5% با میانگین R مثبت با درس ریسک‌محور سازگار است؛ شاهدی بر یک مزیت نیست.',
  'research.a58WinRateWithNegative':
    'نرخ برد ۵۸٪ با میانگین R منفی، شکل کتاب‌درسی ریسک دنبالهٔ پنهان است. آنچه ارزیابی دربارهٔ آن است امید ریاضی است.',
  'research.aDeterministicReplayOf240PracticeSetupsSuggests':
    'یک بازپخش قطعی از 240 ستاپ تمرینی نشان می‌دهد سطح ابطال نوشته‌شده متغیری است که نتایج اندازه‌گذاری را تغییر می‌دهد. نتیجه نمونه‌وار است و اطمینان کمتر از آستانه ارتقا است.',
  'research.aHighWinRateWithANegativeAverage':
    'نرخ برد بالا با میانگین R منفی، شکل کتاب‌درسی یک ریسک دنباله‌ای پنهان است.',
  'research.aPromisingResultStaysInactiveUntil':
    'نتیجهٔ امیدبخش تا تصمیم یک انسان غیرفعال می‌ماند. سامانه نمی‌تواند پیشنهاد خودش را بپذیرد.',
  'research.aReRunAddsANew':
    'اجرای دوباره ارزیابی تازه‌ای با اندازهٔ نمونهٔ خودش می‌افزاید، پس حکم پیشین در همان زمینه‌ای که به آن رسیده بود خواندنی می‌ماند.',
  'research.aReportCanRecommendContinuingOr':
    'یک گزارش می‌تواند ادامه دادن یا متوقف کردن پژوهش را توصیه کند. پذیرفتن یک قاعده اقدامی جدا و نیازمند تأیید انسانی است.',
  'research.aRunningExperimentWithNoEvaluation':
    'آزمایش در حال اجرایی که هنوز ارزیابی ندارد، پنل سنجه‌های خالی نشان می‌دهد.',
  'research.abandoned': 'رها‌شده',
  'research.abandonedAt38TradesRecordedAsARejection':
    'در 38 معامله رها شد. به‌عنوان یک رد ثبت شد، نه بی‌صدا حذف.',
  'research.abandonedWithItsReasonRecordedTheSampleWas':
    'با ثبت دلیلش رها شد: نمونه برای نجات با تنظیم پارامتر خیلی کوچک بود.',
  'research.aboutThisSampleNotTheFuture': 'دربارهٔ این نمونه، نه دربارهٔ آینده',
  'research.activeExperiments': 'آزمایش‌های فعال',
  'research.anUnevaluatedExperimentShowsNoMetrics':
    'آزمایش ارزیابی‌نشده هیچ سنجه‌ای نشان نمی‌دهد — هرگز صفرها، که مثل نتیجهٔ خنثای سنجیده‌شده خوانده می‌شوند.',
  'research.approvalIsExplicit': 'تأیید صریح است',
  'research.approvalRequestedBeforeAnyActivationTheRuleStays':
    'پیش از هر فعال‌سازی، درخواست تأیید شد؛ قاعده تا ثبت شدن تصمیم غیرفعال می‌ماند.',
  'research.assembledFromEvidence': 'ساخته‌شده از شواهد',
  'research.assembledFromStoredEvaluationRowsNoModelText':
    'از سطرهای ارزیابی ذخیره‌شده ساخته شده؛ هیچ متن مدلی در آن نیست.',
  'research.at96TradesTheIntervalAroundAverageR':
    'در 96 معامله، بازه اطراف میانگین R همچنان صفر را در بر می‌گیرد.',
  'research.avgR': 'میانگین R',
  'research.awaitingAHumanDecision': 'در انتظار تصمیم انسانی.',
  'research.awaitingARecordedHumanApproval': 'در انتظار تأیید ثبت‌شدهٔ انسان',
  'research.backlogBlockedOnAnEventCalendarAndDelistingAware':
    'عقب‌افتاده: در انتظار تقویم رویدادها و داده‌ای که حذف از فهرست را در نظر بگیرد.',
  'research.backlogItemNoEvidenceAttachedYet':
    'مورد فهرست کارهای عقب‌افتاده؛ هنوز شاهدی پیوست نشده.',
  'research.bucketSizesAreUnequalSoTheComparisonIs':
    'اندازه سطل‌ها نامساوی است، پس مقایسه هنوز منصفانه نیست.',
  'research.cannotBeEvaluatedUntilTheDataSetIncludes':
    'تا زمانی که مجموعه‌داده شامل نمادهای حذف‌شده و متوقف‌شده نباشد، قابل ارزیابی نیست.',
  'research.caveats': 'قیدها',
  'research.checklistComplianceIsTheVariableThatMovedNot':
    'متغیری که تغییر کرد، پایبندی به چک‌لیست بود، نه شرایط بازار.',
  'research.confidence': 'اعتماد',
  'research.confidenceCaveat':
    'اعتماد جمله‌ای دربارهٔ نمونه است، نه دربارهٔ آینده. نتیجه‌ای زیر حداقل اندازهٔ نمونه دلیلی برای ادامهٔ آزمون است، نه دلیلی برای معامله با آن.',
  'research.confidenceIsTheHighestOnRecordAndStill':
    'اطمینان بالاترین مقدار ثبت‌شده است، و همچنان مجوز حذف بازبینی نیست.',
  'research.confidenceOf62IsBelowTheBarThis':
    'اطمینان 62% کمتر از آستانه این پروژه برای ارتقای هر چیزی است.',
  'research.continuingIsAStudyDecisionNotATrading':
    'ادامه دادن یک تصمیم مطالعاتی است، نه یک تصمیم معاملاتی. اگر چک‌لیست رسماً پذیرفته شود، آن تغییری در قاعده است و پیش از فعال شدن به یک تأیید انسانی ثبت‌شده نیاز دارد.',
  'research.decisionNotActivation': 'تصمیم، نه فعال‌سازی',
  'research.decisionRequired': 'تصمیم لازم است',
  'research.deterministicEvaluationOverTheSyntheticSetEvidenceAp':
    'ارزیابی قطعی روی مجموعه مصنوعی؛ شواهد پیوست می‌شوند، هرگز ویرایش نمی‌شوند.',
  'research.deterministicOutputOverAFixedData':
    'خروجی قطعی روی مجموعه‌داده‌ای ثابت — هرگز برآورد مدل',
  'research.eachSetupWasReplayedWithAFixedRisk':
    'هر ستاپ با بودجه‌ای ثابت بازپخش شد. نیمی پیش از ورود سطح ابطال نوشته‌شده داشتند، نیمی نداشتند. خطاهای اندازه‌گذاری بر اساس قاعده شمرده شد، نه با چشم داوری شد.',
  'research.evaluatedTrades': 'معامله‌های ارزیابی‌شده',
  'research.evidenceIsAppended': 'شواهد افزوده می‌شود',
  'research.experimentStatus.abandoned': 'رها‌شده',
  'research.experimentStatus.awaiting-approval': 'در انتظار تأیید',
  'research.experimentStatus.complete': 'کامل',
  'research.experimentStatus.planned': 'برنامه‌ریزی‌شده',
  'research.experimentStatus.running': 'در حال اجرا',
  'research.experimentVerdict.inconclusive': 'بی‌نتیجه',
  'research.experimentVerdict.pending': 'هنوز حکمی نیست',
  'research.experimentVerdict.promising': 'امیدبخش',
  'research.experimentVerdict.rejected': 'ردشده',
  'research.experiments': 'آزمایش ·',
  'research.experimentsInFlight': 'آزمایش‌های در جریان',
  'research.exportReport': 'خروجی گزارش',
  'research.fadingTheRangeEdgeWithATightInvalidation':
    'معکوس معامله کردن روی لبه رنج با سطح ابطال تنگ، انتظار مثبتی دارد.',
  'research.findingsSummary': 'خلاصهٔ یافته‌ها',
  'research.gapContinuationAfterEarnings': 'ادامه گپ پس از گزارش درآمد',
  'research.generated': '· تولید‌شده',
  'research.hypothesis': 'فرضیه',
  'research.hypothesisWrittenBeforeAnyDataWasReviewed': 'فرضیه پیش از بررسی هر داده‌ای نوشته شد.',
  'research.limitation': 'محدودیت',
  'research.limitationsAreRenderedAlongsideTheFindings':
    'محدودیت‌ها در کنار یافته‌ها نمایش داده می‌شوند، نه در پانویس، تا گزارش مثل چراغ سبز خوانده نشود.',
  'research.loadingAndEmpty': 'بارگذاری و خالی',
  'research.lossPerTradeIsUnchangedByConstructionOnly':
    'زیان هر معامله به‌حکم ساخت تغییری نکرده؛ فقط توزیع خروج جابه‌جا شده است.',
  'research.markedCompleteWithAnInconclusiveToPromisingVerdictAn':
    'با داوری «نامعلوم تا امیدبخش» کامل علامت خورد و قید احتیاط اطمینان به آن پیوست شد.',
  'research.meanOutcomeInRiskUnits': 'میانگین پیامد بر حسب واحد ریسک',
  'research.meanReversionAtTheRangeEdgeAbandoned': 'بازگشت به میانگین در لبه رنج (رهاشده)',
  'research.method': 'روش',
  'research.methodNote':
    'سنجه‌ها با کد قطعی و روی مجموعه‌داده‌ای ثابت تولید می‌شوند، هرگز توسط مدل. یک قاعده تا وقتی ارزیابی وجود نداشته باشد و انسانی آن را تأیید نکند، فعال نمی‌شود.',
  'research.metrics': 'معیارها',
  'research.misleadingOnItsOwn': 'به‌تنهایی گمراه‌کننده',
  'research.missingMeansMissing': 'ناموجود یعنی ناموجود',
  'research.n': 'تعداد =',
  'research.neverEditedInPlace': 'هرگز در جا ویرایش نمی‌شود',
  'research.noBacktestEngineInThisPhase': 'در این مرحله موتور آزمون گذشته‌نگر وجود ندارد',
  'research.noEvaluation': 'بدون ارزیابی',
  'research.noEvaluationAttached': 'ارزیابی‌ای پیوست نشده است',
  'research.noEvaluationAttachedYetSoNo':
    'هنوز ارزیابی‌ای پیوست نشده، پس هیچ سنجه‌ای نمایش داده نمی‌شود.',
  'research.noModelAuthoredTextIsIncluded':
    'هیچ متن نوشتهٔ مدل در گزارش نمی‌آید. بخش‌ها از سطرهای ارزیابی و ارجاع‌های شیوه‌نامه ساخته می‌شوند.',
  'research.noModelText': 'بدون متن مدل',
  'research.noReportForThisExperiment': 'گزارشی برای این آزمایش نیست',
  'research.nothingMeasuredYet': 'هنوز چیزی سنجیده نشده است',
  'research.nothingRecordedYet': 'هنوز چیزی ثبت نشده است',
  'research.open': 'باز',
  'research.openExperiment': 'باز کردن آزمایش',
  'research.openingVolatilityMakesSizingErrorsMoreLikelySo':
    'نوسان آغازین خطاهای اندازه‌گذاری را محتمل‌تر می‌کند، پس صبر 15 دقیقه واریانس میانگین R را پایین می‌آورد.',
  'research.partialEvaluationAt96TradesStillRunning':
    'ارزیابی جزئی در 96 معامله؛ همچنان در حال اجرا.',
  'research.pendingDecisions': 'تصمیم‌های در انتظار',
  'research.performanceMetrics': 'سنجه‌های عملکرد',
  'research.planned': 'برنامه‌ریزی‌شده',
  'research.postEarningsGapsThatHoldTheirOpeningRangeContinue':
    'گپ‌های پس از گزارش درآمد که محدوده بازگشایی خود را نگه می‌دارند، بیشتر ادامه می‌دهند تا پر شوند.',
  'research.previewNotice':
    'دادهٔ پژوهش نمونه. موتور قطعی آزمون گذشته‌نگر در این مرحله ساخته نشده، پس هر سنجهٔ زیر نمونه‌ای از چیدمان با منشأ ساختگی است — نه نتیجهٔ سنجیده‌شده.',
  'research.recordedWithARationale': 'ثبت‌شده همراه با استدلال',
  'research.rejectionsAreKeptAnExperimentTuned':
    'ردها نگه داشته می‌شوند. آزمایشی که تا خوب به نظر رسیدن تنظیم شود، پیامد بدتری از آزمایشی است که کنار گذاشته شد.',
  'research.report': 'گزارش',
  'research.reportedFirst': 'زودتر گزارش شده',
  'research.reportsAreAssembledFromStoredEvaluation':
    'گزارش‌ها از سطرهای ارزیابی ذخیره‌شده و ارجاع‌های شیوه‌نامه ساخته می‌شوند. مدل می‌تواند گزارشی را توضیح دهد، اما عددها را در آن نمی‌نویسد.',
  'research.requestingApprovalWritesAPendingRecord':
    'درخواست تأیید یک رکورد در انتظار می‌نویسد؛ تصمیم، تصمیم‌گیرنده را نام می‌برد و درخواست‌کننده نمی‌تواند آن را بگیرد.',
  'research.research': 'پژوهش',
  'research.researchSections': 'بخش‌های پژوهش',
  'research.riskFirstChecklistBeforeEntry': 'چک‌لیست ریسک‌محور پیش از ورود',
  'research.riskFirstChecklistEvaluationSummary': 'چک‌لیست ریسک‌محور — خلاصه ارزیابی',
  'research.runningPlusAnythingWaitingOnA': 'در حال اجرا، به‌همراه هر چیزی که منتظر تصمیم است',
  'research.sameVisualWeight': 'وزن بصری یکسان',
  'research.sample240WinRate465Average':
    'نمونه 240 · نرخ برد 46.5% · میانگین R 0.32 · حداکثر افت سرمایه ‎−8.4R · اطمینان 62%. نرخ برد گزارش می‌شود چون خواندنش آسان اشتباه می‌شود: موضوع ارزیابی انتظار است، نه نرخ برد.',
  'research.sampleSizeComesBeforeAnyRate':
    'اندازهٔ نمونه پیش از هر نرخ در همهٔ سطوح می‌آید، چون نرخ بدون نمونه‌اش ادعایی بدون محدودیت‌هایش است.',
  'research.sampleSizeIsReportedBeforeAny':
    'اندازهٔ نمونه پیش از هر نرخی گزارش می‌شود، چون نرخ بدون آن شایعه است.',
  'research.selectAnExperimentToInspectIt': 'یک آزمایش را برای بررسی انتخاب کنید',
  'research.skipTheFirst15MinutesOfTheSession': 'پانزده دقیقه نخست سشن را رد کن',
  'research.statedNotHidden': 'اعلام‌شده، نه پنهان',
  'research.stoppedWithTheReasonRecorded': 'متوقف‌شده با ثبت دلیل',
  'research.syntheticDataAndABelowBarConfidenceIntervalThis':
    'داده مصنوعی و بازه اطمینان زیر آستانه. این گزارش دلیلی برای طراحی آزمونی بهتر است، نه دلیلی برای تغییر رفتار.',
  'research.theDataSetIsSyntheticSoTheNumbers':
    'مجموعه‌داده مصنوعی است، پس اعداد همان‌قدر که چک‌لیست را توصیف می‌کنند، مولد داده را هم توصیف می‌کنند. اطمینان 62% کمتر از آستانه ارتقای یک قاعده است. هیچ چیز اینجا بیرون از نمونه آزمون نشده است.',
  'research.theOneLineEachExperimentCurrently': 'تنها خطی که هر آزمایش اکنون پشتیبانی می‌کند',
  'research.theRuleStaysInactiveUntilThen': '. قاعده تا آن زمان غیرفعال می‌ماند.',
  'research.totalAcrossEvaluationsWithMetrics': 'مجموع در همهٔ ارزیابی‌هایی که سنجه تولید کرده‌اند',
  'research.tradesAcrossEveryEvaluationThatProduced':
    'معامله در تمام ارزیابی‌هایی که سنجه تولید کرده‌اند ·',
  'research.tradesInTheEvaluationSet': 'معامله در مجموعهٔ ارزیابی',
  'research.updated': '· به‌روزشده',
  'research.waitingOnAHumanDecisionTheRule':
    'در انتظار تصمیم انسانی — قاعده تا ثبت شدن یکی غیرفعال می‌ماند.',
  'research.waitingOnARecordedHumanDecision': 'در انتظار تصمیم ثبت‌شدهٔ انسان',
  'research.whatThisExperimentCurrentlySupportsAnd':
    'آنچه این آزمایش اکنون پشتیبانی می‌کند، و آنچه نمی‌کند',
  'research.wideningTheInvalidationLevelWhileHoldingTheRisk':
    'بازتر کردن سطح ابطال با ثابت نگه داشتن بودجه ریسک، خروج‌های ناشی از نویز را کاهش می‌دهد بدون افزایش زیان هر معامله.',
  'research.widerInvalidationLevelWithProportionallySmallerSize':
    'سطح ابطال بازتر با حجم متناسباً کوچک‌تر',
  'research.winRateIsNotEdge': 'نرخ برد به‌معنای برتری نیست',
  'research.worstPeakToTroughExcursion': 'بدترین افت از قله تا دره',
  'research.writingTheRiskBudgetAndInvalidationLevelBefore':
    'نوشتن بودجه ریسک و سطح ابطال پیش از در نظر گرفتن پاداش، خطاهای اندازه‌گذاری قابل اجتناب را کاهش می‌دهد.',
  // researchCard ────────────────────────────────────────────────
  'researchCard.noResearchServiceIsConnectedInThisPhase':
    'در این فاز هیچ سرویس تحقیقاتی متصل نیست، پس این کنش بی‌اثر است.',
  // researchPage ────────────────────────────────────────────────
  'researchPage.aCompletedExperimentIsAFinishedMeasurementNot':
    'یک آزمایش کامل‌شده یک اندازه‌گیری تمام‌شده است، نه یک قاعده پذیرفته‌شده.',
  'researchPage.choosingACardShowsItsEvaluationMetricsFindings':
    'انتخاب یک کارت معیارهای ارزیابی، یافته‌ها و منشأ آن را نشان می‌دهد. پیش‌نمایش پنج آزمایش دارد، از جمله یکی که عمداً رها شده است.',
  'researchPage.eachCardStatesItsHypothesisBeforeItsNumbers':
    'هر کارت فرضیه‌اش را پیش از اعدادش اعلام می‌کند.',
  'researchPage.experiments': 'آزمایش‌ها',
  'researchPage.experimentsEvaluated': 'آزمایش‌های ارزیابی‌شده',
  'researchPage.experimentsThatTestAProposedRuleAgainstEvidence':
    'آزمایش‌هایی که یک قاعده پیشنهادی را در برابر شواهد می‌آزمایند. معیارها از کد قطعی روی مجموعه‌داده‌ای ثابت می‌آیند؛ یک قاعده بدون تأیید انسانی ثبت‌شده نمی‌تواند فعال شود.',
  'researchPage.timeline': 'خط زمانی',
  // retryState ──────────────────────────────────────────────────
  'retryState.gaveUp': 'رها شد',
  'retryState.retrying': 'تلاش دوباره',
  // riskSummary ─────────────────────────────────────────────────
  'riskSummary.fees': 'کارمزدها',
  'riskSummary.invalidation': 'سطح ابطال',
  'riskSummary.plannedAndActualValuesForEachMeasure': 'مقادیر برنامه‌ریزی‌شده و واقعی برای هر سنجه',
  'riskSummary.positionSize': 'اندازه پوزیشن',
  'riskSummary.rewardToRisk': 'بازده به ریسک',
  'riskSummary.riskAmount': 'مبلغ ریسک',
  // safetyDialog ────────────────────────────────────────────────
  'safetyDialog.aProposedRuleCannotActivateWithoutAnEvaluation':
    'یک قاعده پیشنهادی بدون ارزیابی و بدون تأیید انسانی ثبت‌شده فعال نمی‌شود. درخواست‌کننده نمی‌تواند پیشنهاد خودش را تأیید کند.',
  'safetyDialog.deterministicMathOwnsEveryNumber': 'ریاضی قطعی مالک هر عدد است',
  'safetyDialog.epistemicLabelsOnEveryStatement': 'برچسب‌های معرفتی روی هر گزاره',
  'safetyDialog.factAnalysisHypothesisAndUncertaintyAreRenderedExpli':
    'واقعیت، تحلیل، فرضیه و عدم‌قطعیت هر یک صریح نمایش داده می‌شوند و حافظه تأییدنشده به‌عنوان عدم‌قطعیت وارد بافت می‌شود — نه به‌عنوان واقعیت.',
  'safetyDialog.humanApprovalForAnythingThatChangesRules':
    'تأیید انسانی برای هر چیزی که قواعد را تغییر می‌دهد',
  'safetyDialog.noLiveTradingAndNoBrokerExecution':
    'بدون معامله زنده و بدون اجرای سفارش توسط کارگزار',
  'safetyDialog.noOperationIdToolJobKindOrConfiguration':
    'برای هیچ‌یک از این دو، شناسه عملیات، ابزار، نوع کار یا کلید تنظیماتی وجود ندارد. پرچم‌های ایمنی به‌صورت false ثابت تایپ شده‌اند، پس هیچ مقداری نمی‌تواند آن‌ها را روشن کند.',
  'safetyDialog.positionSizingRMultiplesAndRiskMetricsComeFrom':
    'اندازه پوزیشن، مضرب‌های R و معیارهای ریسک از ابزارهای تایپ‌شده با آزمون می‌آیند. مدل توضیح می‌دهد؛ هرگز رقم ریسک را محاسبه نمی‌کند.',
  'safetyDialog.whatThisWorkstationIsAllowedToDoAnd':
    'آنچه این ایستگاه کاری مجاز است انجام دهد، و آنچه به‌لحاظ ساختاری نمی‌تواند انجام دهد.',
  // screenshotGallery ───────────────────────────────────────────
  'screenshotGallery.closeFullscreenAttachment': 'بستن پیوست تمام‌صفحه',
  'screenshotGallery.nextAttachment': 'پیوست بعدی',
  'screenshotGallery.openAttachmentFullscreen': 'باز کردن پیوست در تمام‌صفحه',
  'screenshotGallery.pressEscapeOrUseCloseToReturnTo':
    'Escape را بزنید یا از «بستن» برای بازگشت به گالری استفاده کنید. کنترل‌های جهت میان پیوست‌ها جابه‌جا می‌شوند.',
  'screenshotGallery.previousAttachment': 'پیوست قبلی',
  // session ─────────────────────────────────────────────────────
  'session.theDesktopShellDidNotAnswerWithAn':
    'پوسته دسکتاپ با یک نقطه پایانی API پاسخ نداد. ممکن است سرویس محلی هنوز در حال شروع باشد.',
  'session.thisPageIsRunningInABrowserSo':
    'این صفحه در مرورگر اجرا می‌شود، پس نه sidecar محلی برای دریافت جریان وجود دارد و نه مدار کلیدی برای نگه داشتن نشست.',
  'session.vITEMTAPIURLIsSetButVITEMTSESSIONTOKENIsNot':
    'VITE_MT_API_URL تنظیم شده اما VITE_MT_SESSION_TOKEN تنظیم نشده است.',
  // settings ────────────────────────────────────────────────────
  'settings.advanced': 'پیشرفته',
  'settings.aiProviders': 'ارائه‌دهندگان هوش مصنوعی',
  'settings.appearance': 'ظاهر',
  'settings.backgroundJobs': 'کارهای پس‌زمینه',
  'settings.budget': 'بودجه',
  'settings.chartsAndNumericReadoutsStayLTR':
    'نمودارها و خوانش‌های عددی آگاهانه چپ‌به‌راست می‌مانند: سری‌های زمانی مالی از چپ به راست خوانده می‌شوند.',
  'settings.comfortable': 'راحت',
  'settings.compact': 'فشرده',
  'settings.configuration': 'پیکربندی',
  'settings.configurationStoresReferencesSuchAsKeychain':
    'پیکربندی ارجاع‌هایی مانند keychain:llm.openai را ذخیره می‌کند، هرگز خودِ کلیدها را.',
  'settings.dataProvenancePolicy': 'سیاست منشأ داده',
  'settings.dataSafety': 'داده و ایمنی',
  'settings.density': 'تراکم',
  'settings.desktopFirstTheLayoutTargets1280px':
    'دسکتاپ‌محور: چیدمان برای ۱۲۸۰ پیکسل و بالاتر طراحی شده و در پایین‌تر بازچینش می‌شود.',
  'settings.desktopHost': 'میزبان دسکتاپ',
  'settings.enforcedInCodeAndCoveredBy': 'در کد اعمال می‌شود و پوشش آزمون دارد، نه یک تنظیم',
  'settings.historicalDataIsStatedAsHistorical':
    'دادهٔ تاریخی به‌عنوان تاریخی اعلام می‌شود؛ دادهٔ زنده در آموزش مجاز نیست.',
  'settings.howMuchOfTheWorkspaceIs': 'چه مقدار از فضای کار را پوسته اشغال می‌کند',
  'settings.interfaceStatesAllThree': 'وضعیت‌های رابط، هر سه',
  'settings.language': 'زبان',
  'settings.languageAutomatic': 'خودکار',
  'settings.languageAutomaticCaption':
    'فارسی و انگلیسی هر دو از پیامی که می‌فرستید خوانده می‌شوند و پاسخ آن را دنبال می‌کند. اصطلاح‌های فنی به همان شکلی که در هر زبان نوشته می‌شوند می‌مانند.',
  'settings.languageChosen':
    '{language} برگزیده شده است، پس پاسخ هر پیامی هر زبانی که باشد در همان می‌ماند و این رابط نیز به همان زبان نمایش داده می‌شود.',
  'settings.languageEnglish': 'English',
  'settings.languageNotStorable':
    ' این نشست فروشگاه تنظیماتِ نوشتنی ندارد، پس این انتخاب تا بسته شدن برنامه می‌ماند.',
  'settings.languagePersian': 'فارسی',
  'settings.leftToRight': 'چپ به راست',
  'settings.localData': 'دادهٔ محلی',
  'settings.logsRedactCredentialsRecursivelyBeforeAnything':
    'گزارش‌ها پیش از هر نوشتنی اعتبارنامه‌ها را به‌صورت بازگشتی حذف می‌کنند.',
  'settings.modelProviders': 'ارائه‌دهندگان مدل',
  'settings.nothingIsStoredInABrowser':
    'در این مرحله هیچ‌چیز در مرورگر ذخیره نمی‌شود و به جایی فرستاده نمی‌شود.',
  'settings.providerSpecificCodeLivesOnlyIn':
    'کد وابسته به ارائه‌دهنده تنها در لایهٔ آداپتور می‌نشیند',
  'settings.queueStatesTheDurableWorkerLoop':
    'وضعیت‌های صف. حلقهٔ کارگر پایدار وجود دارد؛ صفحهٔ فعالیت هرگاه نشستی در دسترس باشد صف واقعی را می‌خواند و این نمونه‌ها را تنها وقتی نشان می‌دهد که چنین نباشد.',
  'settings.rightToLeft': 'راست به چپ',
  'settings.sampleRows': 'سطرهای نمونه',
  'settings.secrets': 'اسرار',
  'settings.settings': 'تنظیمات',
  'settings.settingsSections': 'بخش‌های تنظیمات',
  'settings.syntheticTrainingDataMustBeLabelled':
    'دادهٔ آموزشی ساختگی هر جا که ظاهر شود باید برچسب داشته باشد.',
  'settings.theGatewayOwnsFallbackOrderRetries':
    'درگاه ترتیب جانشینی، تلاش‌های دوباره، مهلت‌ها و رد بودجه را مدیریت می‌کند. یک ارائه‌دهنده می‌تواند از کار بیفتد بی‌آنکه الگوی مجوزها تغییر کند: مدل می‌تواند ابزاری را درخواست کند، هرگز آن را اجرا نمی‌کند.',
  'settings.theLanguageTheAgentAnswersIn':
    'زبانی که دستیار با آن پاسخ می‌دهد، و زبانی که این رابط با آن نمایش داده می‌شود. حالت خودکار زبان نوشتهٔ شما را دنبال می‌کند',
  'settings.theLayoutUsesLogicalPropertiesSo':
    'چیدمان از ویژگی‌های منطقی استفاده می‌کند، پس آینه کردن نیازی به شیوه‌نامهٔ دوم ندارد',
  'settings.theShellGrantsTheInterfaceNo':
    'پوسته به رابط هیچ مجوز فایل‌سیستم، مسیر، پوسته یا شبکه نمی‌دهد. هر کار ممتاز — زنجیرهٔ کلید، انبارک، خروجی‌ها، فرآیند API همراه — فرمانی نوع‌دار است که در Rust پیاده‌سازی شده، و فهرست مجاز در CI بررسی می‌شود.',
  'settings.theme': 'پوسته',
  'settings.theseAreStartUpAssertionsNot':
    'این‌ها تضمین‌های آغاز به کار هستند، نه ترجیح‌ها: اگر هر یک از آن‌ها روزی روشن شود، فرآیند از راه‌اندازی سر باز می‌زند.',
  'settings.thisInterfaceNeverDisplaysASecret':
    'این رابط هرگز رازی را نمایش نمی‌دهد، حتی پوشانده‌شده.',
  'settings.unverifiedMemoryEntersContextAsUncertainty':
    'حافظهٔ تأییدنشده به‌عنوان عدم‌قطعیت وارد زمینه می‌شود، هرگز به‌عنوان واقعیت.',
  'settings.writingDirection': 'جهت نوشتار',
  // settingsPage ────────────────────────────────────────────────
  'settingsPage.aFailedReadReportsItsTypedCodeAnd':
    'خواندن ناموفق کد تایپ‌شده‌اش را گزارش می‌کند، و تلاش دوباره فقط زمانی پیشنهاد می‌شود که می‌تواند موفق شود — هرگز برای اعتبارنامه ردشده.',
  'settingsPage.aFreshInstallHasNoProvidersAndNo':
    'یک نصب تازه هیچ ارائه‌دهنده و هیچ ارجاع ذخیره‌شده‌ای ندارد؛ این حالتی عادی است و همین را می‌گوید، نه نمایش خطا.',
  'settingsPage.aPIVersion': 'نسخه API',
  'settingsPage.aProtocolMismatchIsRefusedRatherThanGuessed':
    'ناسازگاری پروتکل رد می‌شود، نه حدس زده.',
  'settingsPage.aSkeletonHoldsTheLayoutWhileSettingsAre':
    'یک اسکلت تا زمان خواندن تنظیمات از دیسک یا از پوسته، چیدمان را نگه می‌دارد، تا با رسیدن آن‌ها چیزی نجهد.',
  'settingsPage.aStateIsOnlyShownWhenASurface':
    'یک حالت فقط زمانی نشان داده می‌شود که سطحی واقعاً بتواند به آن برسد؛ افزودن حالت چهارم در اینجا به معنای افزودن یک رفتار است، نه یک تصویر.',
  'settingsPage.appearanceDirectionProvidersAndTheSafetyPostureOf':
    'ظاهر، جهت، ارائه‌دهنده‌ها و وضعیت ایمنی ایستگاه کاری. رمزها در مدار کلید سیستم‌عامل‌اند — تنظیمات فقط ارجاع نگه می‌دارد.',
  'settingsPage.auditRetention': 'نگهداری رد حسابرسی',
  'settingsPage.authenticatedWebSocketLoopbackOnlyTheActivityPageOpe':
    'WebSocket احراز هویت‌شده، فقط loopback. صفحه فعالیت وقتی نشستی وجود دارد آن را باز می‌کند.',
  'settingsPage.breakingChangesAddAVersion': 'تغییرات ناسازگار یک نسخه اضافه می‌کنند.',
  'settingsPage.configurationCouldNotBeRead': 'تنظیمات خوانده نشد',
  'settingsPage.contentAddressedBlobs': 'بلاب‌های محتوامحور.',
  'settingsPage.credentialStore': 'انبار اعتبارنامه',
  'settingsPage.danger': 'خطر',
  'settingsPage.database': 'پایگاه داده',
  'settingsPage.everyDataSurfaceInThisWorkstationOwesYou':
    'هر سطح داده در این ایستگاه کاری این سه را به شما بدهکار است. آن‌ها همان کامپوننت‌های واقعی هستند، خالی نشان داده شده‌اند: هیچ عدد جانگهداری جای مقداری که خوانده نشده را نمی‌گیرد.',
  'settingsPage.fileStorage': 'ذخیره‌سازی فایل',
  'settingsPage.info': 'اطلاعات',
  'settingsPage.keyEntryArrivesWithTheDesktopShellOS':
    'ورود کلید همراه پوسته دسکتاپ (مدار کلید سیستم‌عامل) می‌آید، نه پیش‌نمایش وب.',
  'settingsPage.lessonContentAndLastKnownStatusSurviveWithoutA':
    'محتوای درس و آخرین وضعیت شناخته‌شده بدون شبکه باقی می‌مانند.',
  'settingsPage.localAPI': 'API محلی',
  'settingsPage.modelDirectToolExecution': 'اجرای ابزار مستقیماً توسط مدل',
  'settingsPage.noOperationToolJobKindOrConfigKey':
    'هیچ عملیات، ابزار، نوع کار یا کلید تنظیماتی برای آن وجود ندارد.',
  'settingsPage.nothingConfiguredYet': 'هنوز چیزی تنظیم نشده',
  'settingsPage.offlineCache': 'حافظه پنهان بی‌اتصال',
  'settingsPage.operatingMode': 'حالت عملیاتی',
  'settingsPage.readingConfiguration': 'خواندن تنظیمات',
  'settingsPage.realtimePath': 'مسیر بلادرنگ',
  'settingsPage.sQLiteWALMode': 'SQLite، حالت WAL.',
  'settingsPage.shellProtocol': 'پروتکل پوسته',
  'settingsPage.theBundledAPIBinds127001OnlyOnA':
    'API همراه فقط روی 127.0.0.1، روی یک درگاه ثابت و با یک توکن یک‌بار اجرا bind می‌شود.',
  'settingsPage.theSixThingsThisWorkstationCanSayBack':
    'شش چیزی که این ایستگاه کاری می‌تواند بازگو کند — یک گزارش، یک تأیید یا یک تصمیم — و شکل گذرای همان پیام. اعلان‌ها واقعی‌اند: یکی را برانگیزید و با عمر خود همان لحن ظاهر می‌شود.',
  'settingsPage.theTypeSystemHasNoTrueValueFor': 'سیستم تایپ هیچ مقدار true برای این پرچم ندارد.',
  'settingsPage.toolExecutionAlwaysPassesThroughTheOrchestratorSPerm':
    'اجرای ابزار همیشه از بررسی مجوز ارکستریتور می‌گذرد.',
  'settingsPage.windowsCredentialManagerMacOSKeychainOrSecretService':
    'Windows Credential Manager، Keychain مک یا Secret Service. هرگز یک فایل.',
  // shell ───────────────────────────────────────────────────────
  'shell.aboutThisPreview': 'دربارهٔ این پیش‌نمایش',
  'shell.brokerExecution': 'اجرای کارگزار',
  'shell.disabled': 'غیرفعال',
  'shell.group.learning': 'یادگیری',
  'shell.group.system': 'سامانه',
  'shell.group.workspace': 'فضای کار',
  'shell.later': 'بعداً',
  'shell.liveTrading': 'معاملهٔ زنده',
  'shell.masterTradeTrainingWorkstationLiveTrading':
    'Master Trade · ایستگاه آموزشی · معاملهٔ زنده و اجرای کارگزار به‌حکم طراحی غیرفعال‌اند · هیچ توان سفارش‌گذاری در این برنامه وجود ندارد',
  'shell.nav.academy.description': 'برنامه درسی و درس‌ها در شش ماه',
  'shell.nav.academy.label': 'آکادمی',
  'shell.nav.activity.description':
    'جریان زندهٔ رویدادها و صف کارهای پس‌زمینه، با منشأ و شکست‌هایشان',
  'shell.nav.activity.label': 'فعالیت‌ها',
  'shell.nav.agent.description': 'پرسش بپرسید؛ هر پاسخ شواهد و برچسب عدم‌قطعیت خود را همراه دارد',
  'shell.nav.agent.label': 'فضای کار هوش مصنوعی',
  'shell.nav.dashboard.description': 'پیشرفت آموزش، سنجه‌های مطالعاتی و نمودارهای فقط‌خواندنی',
  'shell.nav.dashboard.label': 'داشبورد',
  'shell.nav.evaluation.description':
    'آنچه تصمیم گرفتید را ثبت کنید و بخوانید که قیمت‌های ثبت‌شده می‌گویند چه رخ داده است — با نام بردن از آنچه سنجیده نشده، نه پر کردن آن — و فهرست قابلیت‌های پشت آن',
  'shell.nav.evaluation.label': 'ارزیابی',
  'shell.nav.exams.description': 'ارزیابی‌ها، نمره‌گذاری با شیوه‌نامه و بازبینی اشتباه‌ها',
  'shell.nav.exams.label': 'آزمون‌ها',
  'shell.nav.journal.description':
    'ثبت کنید واقعاً چه کردید: ستاپ‌ها، ریسک، رعایت قواعد، اشتباه‌ها و درسی که از هر معامله گرفته شد',
  'shell.nav.journal.label': 'دفتر معاملات',
  'shell.nav.lab.description': 'بازبینی ستاپ‌های تمرینی و ریاضیات قطعی ریسک (فقط‌خواندنی)',
  'shell.nav.lab.label': 'آزمایشگاه معاملات',
  'shell.nav.memory.description':
    'آنچه دستیار می‌تواند به کار ببرد، با منبع و وضعیت اعتماد برای هر ادعا',
  'shell.nav.memory.label': 'حافظه',
  'shell.nav.portfolio.description':
    'آنچه دارید را اعلام کنید و ارزش‌گذاری قطعی را بخوانید: تخصیص، بهای تمام‌شده، تمرکز و مواجهه، با نام بردن از هر شکاف نه پر کردن آن',
  'shell.nav.portfolio.label': 'پرتفوی',
  'shell.nav.profile.description':
    'آنچه دربارهٔ معامله‌گری‌تان اعلام کرده‌اید، با منبع و وضعیت تازگی برای هر فیلد',
  'shell.nav.profile.label': 'پروفایل',
  'shell.nav.research.description':
    'آزمایش‌هایی که یک قاعدهٔ پیشنهادی را با شواهد می‌سنجند؛ پذیرش به تأیید نیاز دارد',
  'shell.nav.research.label': 'پژوهش',
  'shell.nav.settings.description': 'ظاهر، جهت، ارائه‌دهندگان و وضعیت ایمنی',
  'shell.nav.settings.label': 'تنظیمات',
  'shell.nav.usage.description':
    'طرح شما، سهم اعتبار و هزینهٔ هر قابلیت — با بیان صریح ردها، نه پنهان کردنشان',
  'shell.nav.usage.label': 'مصرف',
  'shell.navPrimary': 'اصلی',
  'shell.notWiredYet': 'هنوز وصل نشده',
  'shell.previewMockData': 'پیش‌نمایش · دادهٔ نمونه',
  'shell.previewNotice': 'پیش‌نمایش رابط — تنها دادهٔ نمونه، بدون بک‌اند و بدون هوش مصنوعی.',
  'shell.previewSnapshot': 'تصویر لحظه‌ای پیش‌نمایش:',
  'shell.realInThisBuild': 'واقعی در این نسخه',
  'shell.safety': 'ایمنی',
  'shell.safetyDetails': 'جزئیات ایمنی',
  'shell.safetyPosture': 'وضعیت ایمنی',
  'shell.search': 'جست‌وجو',
  'shell.searchArrivesWithTheAPILayer': 'جست‌وجو همراه لایهٔ API در فاز ۳٫۳ می‌آید',
  'shell.searchLessonsSessionsNotes': 'جست‌وجو در درس‌ها، نشست‌ها، یادداشت‌ها',
  'shell.skipToWorkspaceContent': 'پرش به محتوای فضای کار',
  'shell.theseGuaranteesAreAssertedAtStart':
    'این تضمین‌ها هنگام راه‌اندازی بررسی و با آزمون‌ها پوشش داده می‌شوند؛ اگر هر یک از آن‌ها پسرفت کند، ساخت پیش از آنکه این رابط اجرا شود شکست می‌خورد.',
  'shell.training': 'آموزش',
  'shell.yes': 'بله',
  // sidebar ─────────────────────────────────────────────────────
  'sidebar.safetyLiveTradingAndBrokerExecutionDisabledBy':
    'ایمنی: معامله زنده و اجرای سفارش توسط کارگزار به‌حکم طراحی غیرفعال است',
  'sidebar.safetyStatus': 'وضعیت ایمنی',
  // store ───────────────────────────────────────────────────────
  'store.aBacktestVerdictIsNeverARuleActivation': 'حکم یک بک‌تست هرگز فعال‌سازی یک قاعده نیست.',
  'store.noLiveEventStream': 'جریان رویداد زنده‌ای نیست',
  'store.noLocalAPISessionSoTheQueueCannot': 'نشست API محلی وجود ندارد، پس صف خوانده نمی‌شود.',
  'store.theJobCouldNotBeCancelled': 'کار لغو نشد.',
  'store.theJobListCouldNotBeRead': 'فهرست کارها خوانده نشد.',
  'store.theServerRefusedAnAction': 'سرور یک کنش را رد کرد',
  // subscriptionPlanCard ────────────────────────────────────────
  'subscriptionPlanCard.allowancesAreDeclaredInCodeAndServedAs':
    'سهم‌ها در کد اعلام و به‌صورت داده سرو می‌شوند. هیچ‌چیز اینجا خریدنی نیست: در این ساخت یکپارچه‌سازی پرداختی وجود ندارد.',
  'subscriptionPlanCard.everyDeclaredCapabilityByPlanWithItsPerPeriod':
    'هر قابلیت اعلام‌شده، بر حسب طرح، با محدودیت و هزینه هر دوره آن',
  // subscriptionStatusCard ──────────────────────────────────────
  'subscriptionStatusCard.noSubscriptionHasEverBeenStoredForThis':
    'هیچ اشتراکی هرگز برای این حساب ذخیره نشده، پس طرح رایگان به‌عنوان پیش‌فرض گزارش می‌شود، نه از یک سابقه بازخوانی‌شده.',
  // toast ───────────────────────────────────────────────────────
  'toast.dismissThisNotification': 'بستن این اعلان',
  // tokens ──────────────────────────────────────────────────────
  'tokens.aCardEdge': 'لبه کارت',
  'tokens.aFigureWithNoDirectionACountA': 'رقمی بدون جهت: یک شمارش، یک اندازه، یک مدت',
  'tokens.aGainAPassAThingThatWent': 'یک سود، یک قبولی، چیزی که همان‌طور که باید پیش رفت',
  'tokens.aLossAFailAThingThatDid': 'یک زیان، یک رد، چیزی که پیش نرفت',
  'tokens.aStrongEdge': 'لبه قوی',
  'tokens.anOptionThatIsOfferedAndNotChosen': 'گزینه‌ای که پیشنهاد شده و انتخاب نشده است',
  'tokens.annotationText': 'متن حاشیه‌نویسی',
  'tokens.annotationTextInAWell': 'متن حاشیه‌نویسی در یک چاه',
  'tokens.annotationTextOnARaisedCard': 'متن حاشیه‌نویسی روی کارت برجسته',
  'tokens.attentionIsDueAndNoOutcomeHasBeen': 'توجه لازم است و هنوز نتیجه‌ای ثبت نشده',
  'tokens.bodyTextOnACard': 'متن بدنه روی کارت',
  'tokens.bodyTextOnARaisedCard': 'متن بدنه روی کارت برجسته',
  'tokens.bodyTextOnThePage': 'متن بدنه روی صفحه',
  'tokens.brandTextOnACard': 'متن برند روی کارت',
  'tokens.contextProvenanceScopeAStatedLimitation': 'بافت: منشأ، دامنه، یک محدودیت اعلام‌شده',
  'tokens.durationsAndEasingsComponentsMustHonorPrefersReduced':
    'مدت‌ها و توابع easing؛ کامپوننت‌ها باید prefers-reduced-motion را رعایت کنند.',
  'tokens.inkOnAFilledAccentControl': 'مرکب روی یک کنترل تأکیدی پرشده',
  'tokens.inkOnAFilledDestructiveControl': 'مرکب روی یک کنترل مخرب پرشده',
  'tokens.interfaceAndNumericFontStacksTheWeightedType':
    'پشته‌های فونت رابط و عددی، مقیاس وزن‌دار تایپ، و نردبان وزنی که از آن استفاده می‌کند.',
  'tokens.layeringForShellChromeDropdownsModalsToastsAnd':
    'لایه‌بندی برای پوسته شل، فهرست‌های بازشو، مودال‌ها، اعلان‌ها و راهنمای ابزار.',
  'tokens.menusPopoversAndTheModalPanel': 'منوها، فهرست‌های بازشو و پنل مودال',
  'tokens.notOfferedInThisStateByPermissionOr':
    'در این حالت پیشنهاد نشده، به‌حکم مجوز یا طرح — نه به‌حکم خرابی',
  'tokens.phoneLandscape': 'گوشی افقی',
  'tokens.premiumDarkFintechThemeLightThemeDeferredTokens':
    'تم تیره حرفه‌ای فین‌تک. تم روشن به تعویق افتاده؛ توکن‌ها معنایی‌اند، پس می‌توان بدون دست‌زدن به کامپوننت‌ها افزودش کرد.',
  'tokens.presentAndReadableButNotTheCurrentThing': 'موجود و خوانا، اما نه چیز جاری',
  'tokens.radiiByTheKindOfSurfaceMarkInset':
    'شعاع‌ها بر حسب نوع سطح: نشان، تایل داخلی، کنترل، تایل قابل انتخاب، پنل، قرص.',
  'tokens.secondaryText': 'متن ثانویه',
  'tokens.secondaryTextOnARaisedCard': 'متن ثانویه روی کارت برجسته',
  'tokens.semanticSurfacesTextBordersStateColoursAndTheir':
    'سطوح، متن، حاشیه‌ها، رنگ‌های حالت و حاشیه‌هایشان (به‌علاوه رنگ‌های منشأ/معرفتی) به‌صورت معنایی.',
  'tokens.somethingThatWasAskedForCouldNotBe': 'چیزی که خواسته شد اما انجام نشد',
  'tokens.theDefaultCard': 'کارت پیش‌فرض',
  'tokens.theFocusRing': 'حلقه فوکوس',
  'tokens.theOneAccentSurfaceOnAScreenThat': 'تنها سطح تأکیدی روی صفحه‌ای که می‌خواهد رویش کنش شود',
  'tokens.theOptionTheReaderHasChosen': 'گزینه‌ای که خواننده انتخاب کرده است',
  'tokens.theResponsiveLadderPhoneLandscapeTabletDesktopWide':
    'نردبان واکنش‌گرا: گوشی افقی، تبلت، دسکتاپ، عریض و بسیار عریض، به همین ترتیب.',
  'tokens.theThingCurrentlyInViewOrTheOne': 'چیزی که اکنون در دید است، یا چیزی که رویش کنش می‌شود',
  'tokens.unavailableText': 'متن در دسترس نبودن',
  'tokens.wellsAndInsetsCodeLogTailsEmptyPanes': 'چاه‌ها و تودرتوها: کد، دنباله لاگ، پنل‌های خالی',
  // topbar ──────────────────────────────────────────────────────
  'topbar.notificationsAndBackgroundTasks': 'اعلان‌ها و کارهای پس‌زمینه',
  'topbar.toggleWritingDirection': 'تغییر جهت نوشتار',
  // tradeFilters ────────────────────────────────────────────────
  'tradeFilters.clearAllTradeFilters': 'پاک کردن همه فیلترهای معاملات',
  'tradeFilters.dateRange': 'بازه تاریخ',
  'tradeFilters.direction': 'جهت',
  'tradeFilters.market': 'بازار',
  'tradeFilters.result': 'نتیجه',
  'tradeFilters.setup': 'ستاپ',
  'tradeFilters.status': 'وضعیت',
  // tradeForm ───────────────────────────────────────────────────
  'tradeForm.aResultWithoutItsSetupCannotBeReviewed': 'نتیجه‌ای بدون ستاپش قابل بازبینی نیست.',
  'tradeForm.aWrittenRecordIsAppendedToTheJournal':
    'یک سابقه نوشته‌شده به دفتر معاملات افزوده می‌شود؛ هرگز قاعده‌ای را فعال نمی‌کند و هرگز به کارگزار نمی‌رسد.',
  'tradeForm.actualRRealised': 'R واقعی محقق‌شده',
  'tradeForm.attachments': 'پیوست‌ها',
  'tradeForm.cancelThisTradeRecord': 'لغو این سابقه معامله',
  'tradeForm.changingThisReChecksTheLevelsInTheNext':
    'تغییر این، سطوح بخش بعدی را دوباره بررسی می‌کند.',
  'tradeForm.chooseASetup': 'یک ستاپ انتخاب کنید…',
  'tradeForm.commaSeparatedEGASetupRunnerHeld': 'جداشده با کاما، مثلاً A+ setup، runner held.',
  'tradeForm.commission': 'کارمزد',
  'tradeForm.compliantEveryRuleFollowed': 'منطبق — همه قواعد رعایت شد',
  'tradeForm.confluences': 'هم‌گرایی‌ها',
  'tradeForm.discardThisTradeRecord': 'دور ریختن این سابقه معامله',
  'tradeForm.discipline': 'نظم',
  'tradeForm.emotionalStateAfterExit': 'حالت احساسی پس از خروج',
  'tradeForm.emotionalStateBeforeEntry': 'حالت احساسی پیش از ورود',
  'tradeForm.emotionalStateDuringTheTrade': 'حالت احساسی در طول معامله',
  'tradeForm.emptyWhileTheTradeIsOpen': 'تا زمانی که معامله باز است خالی بماند.',
  'tradeForm.entryConfirmation': 'تأیید ورود',
  'tradeForm.entryPrice': 'قیمت ورود',
  'tradeForm.entryRationale': 'منطق ورود',
  'tradeForm.entryTime': 'زمان ورود',
  'tradeForm.executionAndRisk': 'اجرا و ریسک',
  'tradeForm.exitPlan': 'طرح خروج',
  'tradeForm.exitPrice': 'قیمت خروج',
  'tradeForm.exitTime': 'زمان خروج',
  'tradeForm.fear': 'ترس',
  'tradeForm.futureAdjustment': 'تنظیم آینده',
  'tradeForm.greed': 'طمع',
  'tradeForm.hesitation': 'تردید',
  'tradeForm.higherTimeframeBias': 'بایاس تایم‌فریم بالاتر',
  'tradeForm.improvementsToMake': 'بهبودهایی که باید انجام شود',
  'tradeForm.impulsiveness': 'تکانشگری',
  'tradeForm.invalidationCondition': 'شرط ابطال',
  'tradeForm.keepEditingThisRecord': 'ادامه ویرایش این سابقه',
  'tradeForm.keyZone': 'ناحیه کلیدی',
  'tradeForm.leaveEmptyUntilTheTradeIsScored': 'تا زمانی که معامله امتیازدهی نشده خالی بگذارید.',
  'tradeForm.leaveEmptyWhileTheTradeIsOpen': 'تا زمانی که معامله باز است خالی بگذارید.',
  'tradeForm.leavingNowDropsEverythingEnteredOnThisForm':
    'خروج در این لحظه همه چیزهای واردشده در این فرم را از بین می‌برد. هیچ چیز در دفتر معاملات نوشته نشده است.',
  'tradeForm.liquidityContext': 'بافت نقدینگی',
  'tradeForm.mainLesson': 'درس اصلی',
  'tradeForm.markTheItemsSatisfiedBeforeEntryAnUnmarked':
    'موارد تأمین‌شده پیش از ورود را علامت بزنید. چک‌لیست علامت‌نخورده یک خالی است، نه یک قبولی.',
  'tradeForm.marketContext': 'بافت بازار',
  'tradeForm.newsExposure': 'مواجهه با اخبار',
  'tradeForm.notAssessedYet': 'هنوز ارزیابی نشده',
  'tradeForm.notes': 'یادداشت‌ها',
  'tradeForm.onePerLine': 'هر خط یکی.',
  'tradeForm.onePerLineTheseBecomeCountableTags':
    'هر خط یکی. این‌ها به برچسب‌های قابل شمارش تبدیل می‌شوند.',
  'tradeForm.partialAtLeastOneRuleMissed': 'جزئی — حداقل یک قاعده نادیده گرفته شد',
  'tradeForm.planCompliance': 'پایبندی به طرح',
  'tradeForm.plannedManagement': 'مدیریت برنامه‌ریزی‌شده',
  'tradeForm.plannedNotAchieved': 'برنامه‌ریزی‌شده، محقق نشده.',
  'tradeForm.plannedRewardToRisk': 'بازده به ریسک برنامه‌ریزی‌شده',
  'tradeForm.plannedRiskAccountCurrency': 'ریسک برنامه‌ریزی‌شده (ارز حساب)',
  'tradeForm.reportingABreakHonestlyIsWorthMoreThan':
    'گزارش صادقانه یک تخلف ارزشمندتر از سابقه‌ای پاک به‌نظر است.',
  'tradeForm.requiredWhatMakesThisTradeWrong': 'الزامی: چه چیزی این معامله را غلط می‌کند.',
  'tradeForm.ruleChecklist': 'چک‌لیست قواعد',
  'tradeForm.saveThisRecordAsADraft': 'ذخیره این سابقه به‌صورت پیش‌نویس',
  'tradeForm.screenshotsAndMarkupsThatSupportTheRecord':
    'تصاویر و نشانه‌گذاری‌هایی که از سابقه پشتیبانی می‌کنند.',
  'tradeForm.selfReportedRecordedAtTheTimeRatherThanReconstructed':
    'خودگزارشی، ثبت‌شده در همان زمان و نه بازسازی‌شده پس از آن.',
  'tradeForm.stopLossInvalidation': 'حد ضرر / ابطال',
  'tradeForm.submitThisTradeRecord': 'ارسال این سابقه معامله',
  'tradeForm.submittingValidatesTheRecordAndWritesItTo':
    'ارسال، سابقه را اعتبارسنجی و آن را در دفتر معاملات می‌نویسد. نمی‌تواند چیزی را ثبت، تغییر یا ببندد.',
  'tradeForm.symbol': 'نماد',
  'tradeForm.tags': 'برچسب‌ها',
  'tradeForm.takeProfit': 'حد سود',
  'tradeForm.theInstrumentAsYourPlatformNamesIt': 'ابزار همان‌گونه که پلتفرم شما آن را می‌نامد.',
  'tradeForm.theLevelsAndTheRiskTheseMustAgree': 'سطوح و ریسک. این‌ها باید با جهت سازگار باشند.',
  'tradeForm.thePlanWrittenBeforeEntryAndTheChecklist':
    'طرحی که پیش از ورود نوشته شده، و چک‌لیستی که با آن سنجیده شده است.',
  'tradeForm.theTimeframeTheSetupWasReadOn': 'تایم‌فریمی که ستاپ بر آن خوانده شده است.',
  'tradeForm.timeframe': 'تایم‌فریم',
  'tradeForm.tradeDate': 'تاریخ معامله',
  'tradeForm.tradeInformation': 'اطلاعات معامله',
  'tradeForm.tradeStatus': 'وضعیت معامله',
  'tradeForm.tradeThesis': 'تز معاملاتی',
  'tradeForm.tradingPlan': 'طرح معاملاتی',
  'tradeForm.tradingSession': 'سشن معاملاتی',
  'tradeForm.volatilityConditions': 'شرایط نوسان',
  'tradeForm.whatItTaughtARecordWithNoReview':
    'آنچه آموخت. سابقه‌ای که بازبینی ندارد قابل مطالعه نیست.',
  'tradeForm.whatTheChartLookedLikeBeforeTheEntry': 'نمودار پیش از ورود چگونه بود.',
  'tradeForm.whatWasTradedWhenAndFromWhichSetup': 'چه چیزی، چه زمانی و از کدام ستاپ معامله شد.',
  'tradeForm.whatWentWell': 'چه چیزی خوب پیش رفت',
  // tradeRow ────────────────────────────────────────────────────
  'tradeRow.actions': 'کنش‌ها',
  'tradeRow.actualR': 'R واقعی',
  'tradeRow.addReview': 'افزودن بازبینی',
  'tradeRow.dateTime': 'تاریخ / زمان',
  'tradeRow.deleteRecord': 'حذف سابقه',
  'tradeRow.duplicateAsTemplate': 'تکثیر به‌عنوان الگو',
  'tradeRow.editRecord': 'ویرایش سابقه',
  'tradeRow.planRR': 'R:R طرح',
  'tradeRow.risk': 'ریسک',
  'tradeRow.stop': 'حد ضرر',
  'tradeRow.target': 'هدف',
  'tradeRow.thisRecordIsAlreadyArchived': 'این سابقه از قبل بایگانی شده است.',
  'tradeRow.trade': 'معامله',
  'tradeRow.viewDetails': 'مشاهده جزئیات',
  // tradeTable ──────────────────────────────────────────────────
  'tradeTable.clearFilters': 'پاک کردن فیلترها',
  'tradeTable.exportIsNotConnectedInThisPhaseNo':
    'خروجی‌گرفتن در این فاز متصل نیست: هیچ فایلی نوشته نمی‌شود.',
  'tradeTable.exportTheCurrentView': 'خروجی گرفتن از نمای فعلی',
  'tradeTable.journalRecordsAreBeingReadForThisView':
    'سوابق دفتر معاملات برای این نما خوانده می‌شوند.',
  'tradeTable.nextPageOfTrades': 'صفحه بعدی معاملات',
  'tradeTable.previousPageOfTrades': 'صفحه قبلی معاملات',
  'tradeTable.readingTrades': 'خواندن معاملات',
  'tradeTable.restoreDefaultColumns': 'بازگرداندن ستون‌های پیش‌فرض',
  'tradeTable.showEveryColumn': 'نمایش همه ستون‌ها',
  'tradeTable.tradeHistoryWithDateSymbolDirectionSetupRisk':
    'تاریخچه معاملات با تاریخ، نماد، جهت، ستاپ، ریسک، R محقق‌شده، نتیجه، پایبندی به قواعد و وضعیت. هر سطر فهرستی از کنش‌های سابقه دارد.',
  // tradingLabPage ──────────────────────────────────────────────
  'tradingLabPage.aPendingToolShowsTheToolSNameAnd':
    'یک ابزار در انتظار، نام و ورودی‌هایش را نشان می‌دهد، هرگز عدد موقتی — عددی که بعداً تغییر کند بدتر از یک چرخان است.',
  'tradingLabPage.aRefusalOrAFailureIsShownWith':
    'رد یا شکست با کد تایپ‌شده‌اش نشان داده می‌شود: عملیات ردشده و ابزار در دسترس نبودن پاسخ‌های متفاوتی‌اند و نباید یکسان خوانده شوند.',
  'tradingLabPage.aToolCallIsARoundTripThese':
    'یک فراخوانی ابزار یک رفت‌وبرگشت است. این‌ها دو حالتی هستند که پس از آن می‌آیند؛ حالت خالی پیش از فراخوانی همان پنل بالاست.',
  'tradingLabPage.aTrainingSurfaceForReviewingPracticeSetupsAnd':
    'سطحی تمرینی برای بازبینی ستاپ‌های تمرینی و ریاضی ریسک. فقط‌خواندنی: در هیچ‌جای این برنامه ورود سفارش، اتصال کارگزار یا مسیر اجرا وجود ندارد.',
  'tradingLabPage.approvalWorkflowLandsWithThePersistenceSliceThe':
    'گردش کار تأیید همراه بخش ماندگارسازی می‌آید؛ دروازه در بک‌اند از قبل اعمال شده است.',
  'tradingLabPage.noButtonOnThisPageCanArmAnything':
    'هیچ دکمه‌ای در این صفحه نمی‌تواند چیزی را مسلح کند: برنامه هیچ مسیر سفارشی ندارد، پس یک رقم ریسک فقط می‌تواند به یک تصمیم مطالعاتی آگاهی بدهد.',
  'tradingLabPage.noExecutionCapabilityExistsInTheSystemSo':
    'هیچ قابلیت اجرایی در سیستم وجود ندارد، پس هیچ چیز اینجا مسلح نمی‌شود.',
  'tradingLabPage.practiceAccountBalance': 'موجودی حساب تمرینی',
  'tradingLabPage.riskMath': 'ریاضی ریسک',
  'tradingLabPage.riskPerTrade': 'ریسک هر معامله (%)',
  'tradingLabPage.runningTheDeterministicTool': 'اجرای ابزار قطعی',
  'tradingLabPage.setupReview': 'بازبینی ستاپ',
  'tradingLabPage.theRiskToolsExistInTheBackendAnd':
    'ابزارهای ریسک در بک‌اند وجود دارند و آزمون دارند، اما رابط در این فاز به آن‌ها سیم‌کشی نشده است.',
  'tradingLabPage.theToolCallFailed': 'فراخوانی ابزار ناموفق شد',
  'tradingLabPage.theToolRegistryAndRiskMathAreImplemented':
    'رجیستری ابزار و ریاضی ریسک پیاده‌سازی شده‌اند؛ این فاز فقط رابط را عرضه می‌کند، پس پنل بی‌اثر است.',
  'tradingLabPage.whenWiredThePanelShowsTheToolName':
    'وقتی سیم‌کشی شود، پنل نام ابزار، ورودی‌هایش و یک برچسب واقعیت را نشان می‌دهد — هرگز عددی که نوشته مدل باشد.',
  // trend ───────────────────────────────────────────────────────
  'trend.notAvailable': 'در دسترس نیست',
  // ui ──────────────────────────────────────────────────────────
  'ui.closeDialog': 'بستن گفت‌وگو',
  'ui.epistemic.analysis': 'تفسیری که بر منابع اعلام‌شده بنا شده است.',
  'ui.epistemic.fact': 'گرفته‌شده از منبعی تأییدشده یا نتیجهٔ ابزاری قطعی.',
  'ui.epistemic.hypothesis': 'ادعایی آزمون‌پذیر که هنوز تأیید نشده است.',
  'ui.epistemic.uncertainty': 'محدودیت‌های شناخته‌شده، شواهد ناموجود یا پرسشی حل‌نشده.',
  'ui.live': 'زنده',
  'ui.notifications': 'اعلان‌ها',
  'ui.raise': 'نمایش دادن',
  'ui.readOnly': 'فقط‌خواندنی',
  'ui.theSameComponentWithALifetime':
    'همان جزء با یک عمر. روی یکی بایستید یا فوکوس کنید تا شمارش معکوسش بایستد؛ مدت پیش‌فرض هر لحن جداست و پیام ویرانگر هیچ مدتی ندارد چون منتظر تصمیم است. خود کارت همان تأکید لهجه‌ای این نمونه است: تنها سطحی در یک صفحه که می‌خواهد رویش اقدام شود، اینجا ترسیم شده نه توصیف.',
  'ui.toastsOnTheAccentCard': 'اعلان‌های گذرا — روی کارت لهجه‌دار',
  // usage ───────────────────────────────────────────────────────
  'usage.aPlanNeverGrantsAnOperation':
    'یک طرح هرگز عملیاتی را که نقش شما رد می‌کند اعطا نمی‌کند، پس این با ارتقا حل نمی‌شود.',
  'usage.allowance': 'سهم',
  'usage.attemptStatus.refused': 'پیش از اجرا رد شد — هیچ هزینه‌ای برداشت نشد',
  'usage.attemptStatus.released': 'چیزی کامل نشد — بازگردانده شد',
  'usage.attemptStatus.reserved': 'نگه‌داشته‌شده',
  'usage.attemptStatus.settled': 'کامل شد و هزینه‌اش برداشت شد',
  'usage.balance': 'مانده',
  'usage.capability': 'قابلیت',
  'usage.capabilitySUnaffordableNow': 'قابلیت که اکنون از عهدهٔ هزینه‌اش برنمی‌آیید',
  'usage.category': 'دسته',
  'usage.consumed': 'مصرف‌شده',
  'usage.consumptionThisPeriod': 'مصرف این دوره',
  'usage.couldNotReadUsage': 'مصرف خوانده نشد',
  'usage.couldNotReadUsageHistory': 'تاریخچهٔ مصرف خوانده نشد',
  'usage.countedFromTheLedgerRatherThan':
    'از دفتر کل شمرده می‌شود، نه از یک شمارندهٔ ذخیره‌شده، پس هزینهٔ اصلاح‌شده نمی‌تواند شمارش را نادرست بگذارد.',
  'usage.credits': 'اعتبار',
  'usage.creditsLeft': 'اعتبار باقی‌مانده',
  'usage.creditsPerInvocationOnceItExists': 'اعتبار در هر فراخوان، وقتی وجود داشته باشد.',
  'usage.creditsPerPeriod': 'اعتبار در هر دوره',
  'usage.current': 'جاری',
  'usage.declaredCapabilities': 'قابلیت‌های اعلام‌شده',
  'usage.defaultNotRecorded': 'پیش‌فرض، ثبت‌نشده',
  'usage.description': 'طرح شما، سهم اعتبار شما، هزینهٔ هر قابلیت و آنچه واقعاً مصرف شده است.',
  'usage.everyCapabilityThePlatformDeclaresWhether':
    'هر قابلیتی که سامانه اعلام می‌کند، چه ساخته شده باشد و چه نه. قابلیتی که ساخته نشده و قابلیتی که در طرح شما نیست دو پاسخ متفاوت‌اند و هرگز با یک عبارت نمایش داده نمی‌شوند.',
  'usage.everyInvocationIncludingTheOnesThat':
    'هر فراخوان، از جمله آن‌هایی که پیش از اجرا رد شدند و آن‌هایی که هزینه‌ای نداشتند.',
  'usage.expired': 'منقضی‌شده',
  'usage.granted': 'اعطا‌شده',
  'usage.includedNoSeparateCap': 'شامل است، بدون سقف جداگانه',
  'usage.ledgerKind.adjustment': 'تعدیل',
  'usage.ledgerKind.consume': 'اعتبار نگه‌داشته‌شده',
  'usage.ledgerKind.expire': 'سهم منقضی شد',
  'usage.ledgerKind.grant': 'سهم اعطا شد',
  'usage.ledgerKind.refund': 'اعتبار بازگردانده شد',
  'usage.ledgerStatus.released': 'بازگردانده شد — کار کامل نشد',
  'usage.ledgerStatus.reserved': 'تا کامل شدن کار نگه داشته شده است',
  'usage.ledgerStatus.settled': 'نهایی',
  'usage.movements': 'حرکت‌ها',
  'usage.noAttemptsYet': 'هنوز تلاشی نبوده است',
  'usage.noCapabilityIsCappedSeparatelyBy': 'هیچ قابلیتی به‌طور جداگانه در این طرح سقف ندارد',
  'usage.noHistoryToShow': 'تاریخچه‌ای برای نمایش نیست',
  'usage.noMovementsYet': 'هنوز حرکتی نیست',
  'usage.noUsageToShow': 'مصرفی برای نمایش نیست',
  'usage.notEnoughCredits': 'اعتبار کافی نیست',
  'usage.notInThisPlan': 'در این طرح نیست',
  'usage.notIncluded': 'شامل نیست',
  'usage.notLimitedSeparatelyByThisPlan':
    'در این طرح به‌طور جداگانه محدود نمی‌شود؛ مانده تنها سقف است.',
  'usage.notPermittedForYourRole': 'برای نقش شما مجاز نیست',
  'usage.nothingHereCanTakeAPayment':
    'هیچ‌چیز اینجا نمی‌تواند پرداخت بگیرد: این نسخه هیچ درگاه پرداختی ندارد و هر طرح به‌عنوان خریدنی‌نبودن اعلام شده است.',
  'usage.oneCreditIsOneAgentTurn':
    'هر اعتبار یک نوبت دستیار است. هر عدد در ادامه روی سرور و از طرح ذخیره‌شده و دفتر کل خودتان محاسبه می‌شود.',
  'usage.perPeriod': 'در هر دوره',
  'usage.plans': 'طرح‌ها',
  'usage.priceNotOfferedThisBuildHas':
    'قیمت: ارائه نمی‌شود. این نسخه درگاه پرداختی ندارد، پس این طرح خریدنی نیست و هیچ مبلغی نمایش داده نمی‌شود.',
  'usage.retired': 'بازنشسته',
  'usage.returned': 'بازگردانده‌شده',
  'usage.returned2': 'بازگردانده‌شده',
  'usage.thatIsAGapInThe': 'این شکافی در محصول است، نه در حق شما — هزینهٔ اعلام‌شده',
  'usage.theAllowanceIsABudgetFor':
    'سهم یک بودجه برای این دوره است، نه مانده‌ای که انباشته شود، و قابلیت‌های قطعی با سهم مصرف‌شده هم کار می‌کنند.',
  'usage.theAllowanceRenewsAt': 'سهم در این زمان تازه می‌شود',
  'usage.thisBuildHasNoPaymentIntegration':
    'این نسخه درگاه پرداختی ندارد، پس هیچ طرحی خریدنی نیست و هیچ قیمتی نمایش داده نمی‌شود. تغییر طرح تنها به‌صورت اعطای اداری و با تصمیم ثبت‌شده در پرونده ثبت می‌شود.',
  'usage.thisDeploymentReportsA': 'این استقرار گزارش می‌دهد',
  'usage.thisPeriod': 'این دوره',
  'usage.tryAgain': 'تلاش دوباره',
  'usage.usageCredits': 'اعتبار مصرف',
  'usage.usageHistory': 'تاریخچهٔ مصرف',
  'usage.usageHistoryHasNotBeenRequested': 'تاریخچهٔ مصرف هنوز درخواست نشده است',
  'usage.usageSections': 'بخش‌های مصرف',
  'usage.usageStoreBalancesAndHistoryAre':
    'فروشگاه مصرف: مانده‌ها و تاریخچه اینجا پایدار نیستند، پس راه‌اندازی دوباره آن‌ها را بازنشانی می‌کند. خود قابلیت همچنان اندازه‌گیری می‌کند.',
  'usage.usedSinceTheAccountWasCreated': 'مصرف‌شده از زمان ساخت حساب',
  'usage.usedThisPeriod': 'مصرف‌شده در این دوره',
  'usage.whatEachCostMeans': 'هر هزینه به چه معناست',
  'usage.whatThisPlanMayNotDo': 'این طرح چه کاری نمی‌تواند بکند',
  'usage.yourPlan': 'طرح شما',
  // usageCreditsCard ────────────────────────────────────────────
  'usageCreditsCard.thisPeriod': 'این دوره',
  // usageHistory ────────────────────────────────────────────────
  'usageHistory.noMeteredCapabilityHasBeenInvokedOnThis':
    'در این حساب هیچ قابلیت اندازه‌گیری‌شده‌ای فراخوانی نشده است.',
  'usageHistory.nothingHasBeenGrantedHeldReturnedOrAdjusted':
    'در این حساب هیچ مبلغی اعطا، نگه‌داشته، بازگردانده یا تعدیل نشده است.',
  'usageHistory.theFirstAgentTurnOfThePeriodGrants':
    'نخستین نوبت عامل در دوره، سهم دوره را اعطا می‌کند، پس به‌محض اجرای هر چیز اندازه‌گیری‌شده این فهرست پر می‌شود.',
  // usagePage ───────────────────────────────────────────────────
  'usagePage.allowancesAddedIncludingThePeriodGrant': 'سهم‌های افزوده‌شده، شامل اعطای دوره',
  'usagePage.consumed': 'مصرف‌شده',
  'usagePage.creditsGivenBackWhenWorkDidNotComplete': 'اعتبار بازگردانده‌شده وقتی کار کامل نشد',
  'usagePage.creditsKeptForCompletedWork': 'اعتبار نگه‌داشته‌شده برای کارهای کامل‌شده',
  'usagePage.expired': 'منقضی‌شده',
  'usagePage.granted': 'اعطاشده',
  'usagePage.noUsageStoreIsReachableFromThisSession':
    'از این نشست هیچ انبار مصرفی در دسترس نیست، پس دفتری برای خواندن وجود ندارد. چیزی به‌جای آن نشان داده نمی‌شود.',
  'usagePage.openThisTabToReadTheMovementsAnd':
    'این برگه را باز کنید تا حرکت‌ها و تلاش‌های پشت موجودی را بخوانید.',
  'usagePage.theCreditBalanceIsTheOnlyLimitSo':
    'موجودی اعتبار تنها محدودیت است، پس مصرف به‌تفکیک قابلیت برای گزارش وجود ندارد.',
  'usagePage.unusedAllowanceAtTheEndOfAPeriod': 'سهم استفاده‌نشده در پایان یک دوره',
};
