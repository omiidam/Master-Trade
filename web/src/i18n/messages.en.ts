/**
 * The English catalogue — the source of truth for every string the application says.
 *
 * Extracted from the application source once, by the Phase 7.5.3.3 codemod, and authored from here on.
 * Each key is `<area>.<what it says>`, and each value is what the interface rendered before it was
 * translatable — byte-identical, whitespace included, so the English interface is unchanged.
 *
 * `MessageKey` is derived from this object, so adding a string here is what makes it addressable, and the
 * Persian catalogue is typed as a complete record of these keys, which makes a missing translation a
 * compile error rather than one English sentence in the middle of a Persian screen.
 */

export const EN_MESSAGES = {
  // aIReviewPanel ───────────────────────────────────────────────
  'aIReviewPanel.aProviderIsGeneratingAReviewProgressIs':
    'A provider is generating a review. Progress is reported by the job queue, and is never animated here to look busier than it is.',
  'aIReviewPanel.noReviewProviderIsConnectedToTheJournal':
    'No review provider is connected to the journal. The panel exists so the surface is designed before the capability arrives.',
  'aIReviewPanel.openQuestionsForTheTraderEachTiedTo':
    'Open questions for the trader, each tied to a specific record. A review proposes study, never a rule change and never a live decision.',
  'aIReviewPanel.plannedVersusCommittedRiskWithTheDivergenceFlagged':
    'Planned versus committed risk, with the divergence flagged. The numbers come from the record; a review may explain them but never produces them.',
  'aIReviewPanel.processAdherence': 'Process adherence',
  'aIReviewPanel.retryTheReviewRequest': 'Retry the review request',
  'aIReviewPanel.riskAndSizing': 'Risk and sizing',
  'aIReviewPanel.theLayoutACompletedReviewWillTakeEvery':
    'The layout a completed review will take. Every field is empty by construction — no model output exists in this phase.',
  'aIReviewPanel.theRequestFailedThePanelReportsTheTyped':
    'The request failed. The panel reports the typed reason and offers a retry, because a failed review must not look like an empty one.',
  'aIReviewPanel.theReviewRequestIsQueuedAndHasNot':
    'The review request is queued and has not been sent to a provider. Nothing is in flight yet.',
  'aIReviewPanel.whatToExamineNext': 'What to examine next',
  'aIReviewPanel.whereTheRecordShowsThePlanWasFollowed':
    'Where the record shows the plan was followed, and where it does not. Fields are filled from the checklist and the record, not from the review.',
  // aboutDialog ─────────────────────────────────────────────────
  'aboutDialog.smarterTradingBiggerPossibilities': 'Smarter trading. Bigger possibilities.',
  // academy ─────────────────────────────────────────────────────
  'academy.academy': 'Academy',
  'academy.academySections': 'Academy sections',
  'academy.and': 'and',
  'academy.answersAreScoredAgainstARubric':
    "Answers are scored against a rubric, not by the model's opinion.",
  'academy.bestScorePerExamination': 'Best score per examination',
  'academy.curriculumProgress': 'Curriculum progress',
  'academy.examAverage': 'Exam average',
  'academy.examRunnerIsNotPartOf': 'Exam runner is not part of this phase',
  'academy.examinationIntegrity': 'Examination integrity',
  'academy.explanationsCarry': 'Explanations carry',
  'academy.gradingIsRubricBasedAndDeterministic':
    'Grading is rubric-based and deterministic; the model does not decide pass/fail.',
  'academy.howGradingWorks': 'How grading works',
  'academy.labels': 'labels.',
  'academy.lessonStatesAndPrerequisiteGating': 'Lesson states and prerequisite gating',
  'academy.lessons': 'lessons',
  'academy.lessonsComplete': 'lessons complete',
  'academy.lessonsComplete2': 'Lessons complete',
  'academy.locked': 'Locked',
  'academy.module2RiskFirst': 'Module 2 — Risk First',
  'academy.progressIsRecordedPerLessonNever':
    'Progress is recorded per lesson, never inferred from time spent.',
  'academy.questions': 'questions',
  'academy.ruleChangesProposedDuringStudyRequire':
    'Rule changes proposed during study require human approval before activation.',
  'academy.sixMonthCurriculum': 'Six-month curriculum',
  'academy.statesThisCurriculumSurfaceOwesYou': 'States this curriculum surface owes you',
  'academy.whatTheAcademyGuarantees': 'What the Academy guarantees',
  // academyPage ─────────────────────────────────────────────────
  'academyPage.aFailedReadIsReportedWithItsTyped':
    'A failed read is reported with its typed code instead of an empty list, because an empty curriculum and an unreadable one demand different actions.',
  'academyPage.aSixMonthCurriculumFromMarketMechanicsToIndependent':
    'A six-month curriculum from market mechanics to independent operation. Lessons unlock by prerequisite; examinations are graded deterministically.',
  'academyPage.curriculumCouldNotBeRead': 'Curriculum could not be read',
  'academyPage.eachModuleListsItsFocusAreasLockedModules':
    'Each module lists its focus areas. Locked modules unlock when prerequisites are complete.',
  'academyPage.moduleSkeletonsHoldTheLayoutWhileTheCurriculum':
    'Module skeletons hold the layout while the curriculum is read, so unlocked and locked cards do not shift position.',
  'academyPage.progressIsRecordedPerLessonAgainstTheReal':
    'Progress is recorded per lesson against the real curriculum when the persistence slice lands; nothing here is inferred from time spent.',
  'academyPage.readingTheCurriculum': 'Reading the curriculum',
  'academyPage.theInterfaceForTakingAnExamWillBe':
    'The interface for taking an exam will be added with the persistence slice, when lessons and attempts can actually be stored and graded.',
  'academyPage.theModuleListIsStaticInThisPreview':
    'The module list is static in this preview. These are the two states it will use once lessons are read from the backend; the empty case is shown in the Examinations tab.',
  'academyPage.unlocksWhenPrerequisiteLessonsAreComplete':
    'Unlocks when prerequisite lessons are complete.',
  'academyPage.untilThenThisTabShowsThePlannedShape':
    'Until then this tab shows the planned shape, not a working exam.',
  // activity ────────────────────────────────────────────────────
  'activity.aPayloadThatFailsItsContract':
    'A payload that fails its contract, or a type this build does not know, is counted and refused. Rendering it anyway would mean printing a shape nobody validated.',
  'activity.aReplayGapWasDetectedIn': 'A replay gap was detected in this session',
  'activity.activitySections': 'Activity sections',
  'activity.available': 'available',
  'activity.backoffThenStop': 'Backoff, then stop',
  'activity.bothActionsGoThroughTheSame':
    'Both actions go through the same authenticated session as the stream.',
  'activity.defaultTypes': 'default types',
  'activity.deliveredVsDroppedFrames': 'Delivered vs. dropped frames',
  'activity.endpoint': 'Endpoint',
  'activity.everyEventCarriesAMonotonicSequence':
    'Every event carries a monotonic sequence number. A duplicate or an older event is dropped, so a reconnect cannot make the feed run backwards — and the count of dropped frames is on screen above.',
  'activity.frameSDroppedStaleOrUnreadable':
    'frame(s) dropped — stale or unreadable. A dropped frame is counted, never rendered as if it passed validation.',
  'activity.frameValidation': 'Frame validation',
  'activity.heartbeat': 'Heartbeat',
  'activity.ifTheServerSBufferNo':
    "If the server's buffer no longer covers that point, the client records the gap and says so, instead of continuing from a counter that looks continuous.",
  'activity.inboundFramesAreBoundedParsedAnd':
    'Inbound frames are bounded, parsed and checked against the contract registry before anything is done with them. A malformed frame is counted and dropped, never rendered.',
  'activity.internalEventsNeverArrive': 'Internal events never arrive',
  'activity.kind.backtest.run': 'Run a backtest (needs approval)',
  'activity.kind.dataset.process': 'Validate and index a dataset',
  'activity.kind.embedding.generate': 'Generate embeddings',
  'activity.kind.evaluation.scheduled': 'Scheduled invariant evaluation',
  'activity.kind.maintenance.cleanup': 'Purge expired scratch data',
  'activity.kind.marketData.ingest': 'Ingest normalized bars',
  'activity.kind.memory.index': 'Index memory records',
  'activity.kind.report.generate': 'Render a report',
  'activity.kind.training.gradeSession': 'Grade a training session',
  'activity.kind.training.progress': 'Recompute curriculum progress',
  'activity.lifecycle': 'Lifecycle',
  'activity.more': 'more',
  'activity.noLiveStreamInThisSession': 'No live stream in this session',
  'activity.noNoticesInThisSession': 'No notices in this session',
  'activity.previewFixtures': 'Preview fixtures',
  'activity.queue': 'Queue',
  'activity.raisedByThisClientAboutThe':
    'Raised by this client about the stream itself — a gap in replay coverage, a refused frame, a refused subscription. They are kept because a silent hole is worse.',
  'activity.reReadTheQueue': 'Re-read the queue',
  'activity.resumeReplayAndTheHonestGap': 'Resume, replay and the honest gap',
  'activity.retriesUseBoundedExponentialBackoffWith':
    'Retries use bounded exponential backoff with jitter. A rejected token, a protocol mismatch or a refused subscription is terminal: the state moves to “not permitted” and no further attempts are made.',
  'activity.retryTheStreamNow': 'Retry the stream now',
  'activity.roles': 'Roles',
  'activity.sequenceNotArrivalOrder': 'Sequence, not arrival order',
  'activity.serverNoticesAndStreamWarnings': 'Server notices and stream warnings',
  'activity.session': 'Session',
  'activity.showingCapturedFixtures': 'Showing captured fixtures',
  'activity.socket': 'Socket',
  'activity.source': 'Source',
  'activity.stream': 'Stream',
  'activity.subscribeToEverythingThisRoleMay': 'Subscribe to everything this role may receive',
  'activity.subscription': 'Subscription',
  'activity.theClientPingsOnTheServer':
    "The client pings on the server's cadence and treats a missed reply as a failure. A socket that is open but silent is not a working stream, and showing “live” for one is the failure mode the check exists to prevent.",
  'activity.theClientRemembersTheHighestSequence':
    'The client remembers the highest sequence it delivered and asks the server to replay from there, in the same frame as the token — a client that authenticated first and subscribed second would miss the replay it just asked for.',
  'activity.theTokenIsNeverRenderedNever':
    'The token is never rendered, never logged and never placed in a URL. It goes in the first frame, and only the credentials the shell hands over are used.',
  'activity.toolExecutionDetailAndAuditRecords':
    'Tool execution detail and audit records are internal: the server refuses to give them an audience, so no subscription can ask for them and no payload arrives to be hidden.',
  'activity.unknownTypesAreDropped': 'Unknown types are dropped',
  'activity.whatAReconnectKeeps': 'What a reconnect keeps',
  'activity.whatThisClientAskedToReceive': 'What this client asked to receive',
  'activity.whereThisClientIsPointedAnd': 'Where this client is pointed, and with what',
  // activityPage ────────────────────────────────────────────────
  'activityPage.aRetryableFailureReturnsToQueuedWithBackoff':
    'A retryable failure returns to queued with backoff; a non-retryable one stops immediately.',
  'activityPage.aWorkerClaimedTheJobAndHoldsA':
    'A worker claimed the job and holds a lease; the lease is renewed while it runs.',
  'activityPage.connectToSeeRealEntriesTheRowsBelow':
    'Connect to see real entries; the rows below this notice are the labelled preview fixtures.',
  'activityPage.connection': 'Connection',
  'activityPage.deterministicSamplesSoTheSeverityLevelsCanBe':
    'Deterministic samples so the severity levels can be reviewed without a server.',
  'activityPage.eventStream': 'Event stream',
  'activityPage.nothingHasArrivedYet': 'Nothing has arrived yet',
  'activityPage.someEventsBetweenTheDeliveredSequenceAndThe':
    "Some events between the delivered sequence and the server's buffer were never seen. The queue and the audit trail are the record of what happened; the feed is not.",
  'activityPage.theEventStreamOpensOverAnAuthenticatedWebSocket':
    'The event stream opens over an authenticated WebSocket on the loopback interface only.',
  'activityPage.theFourTransitionsTheQueueDefinesAndWhat':
    'The four transitions the queue defines, and what the UI shows for each.',
  'activityPage.theRealtimeEventStreamAndTheBackgroundTaskQueue':
    'The realtime event stream and the background-task queue. Events carry a contract type, a sequence, a source and a correlation id; jobs are read from the queue that runs them. Neither surface exists to place or execute anything.',
  'activityPage.theResultIsStoredAndTheProgressRow':
    'The result is stored and the progress row is left behind to expire.',
  'activityPage.theStatusIsRecordedInTheRowSo':
    'The status is recorded in the row, so cancellation crosses processes and survives a restart.',
  // agent ───────────────────────────────────────────────────────
  'agent.aIWorkspace': 'AI workspace',
  'agent.activationIsImpossibleWithoutARecorded':
    'Activation is impossible without a recorded human approval; automation cannot self-authorize.',
  'agent.awaitingYourApprovalSelfApprovalIs': 'Awaiting your approval — self-approval is rejected',
  'agent.contextSections': 'Context sections',
  'agent.conversation': 'Conversation',
  'agent.deterministicEvaluationAttached': 'Deterministic evaluation attached',
  'agent.eachMessageShowsItsEpistemicLabel':
    'Each message shows its epistemic label and its sources',
  'agent.epistemicLabels': 'Epistemic labels:',
  'agent.examples': 'Examples',
  'agent.mockTranscript': 'mock transcript',
  'agent.noModelProviderIsConfigured': 'No model provider is configured',
  'agent.proposedRule': 'Proposed rule',
  'agent.ruleProposals': 'Rule proposals',
  'agent.runContext': 'Run context',
  'agent.sources': 'Sources',
  'agent.statesATurnGoesThrough': 'States a turn goes through',
  'agent.theGatewayHoldsNoToolRegistry':
    'The gateway holds no tool registry and exposes no execution method.',
  'agent.toolRequestPath': 'Tool request path',
  'agent.unchangedGuarantees': 'Unchanged guarantees',
  // agentWorkspacePage ──────────────────────────────────────────
  'agentWorkspacePage.aNewConversationSaysSoAndWhatIt':
    'A new conversation says so, and what it will show: statements labelled fact, analysis, hypothesis or uncertainty, each with its sources.',
  'agentWorkspacePage.aTurnIsARoundTripWithA':
    'A turn is a round trip with a provider that may be slow, and a conversation can simply be new. Both are shown here as the real components the wired version will use.',
  'agentWorkspacePage.addAnIntegration': 'Add an integration',
  'agentWorkspacePage.agentLifecycleState': 'Agent lifecycle state',
  'agentWorkspacePage.allowedTheDeterministicToolRunsAndItsResult':
    'Allowed: the deterministic tool runs and its result is recorded with provenance.',
  'agentWorkspacePage.attachAFile': 'Attach a file',
  'agentWorkspacePage.attachmentsAreNotPartOfThisBuild': 'Attachments are not part of this build.',
  'agentWorkspacePage.brokerExecutionDisabled': 'Broker execution: disabled',
  'agentWorkspacePage.budgetUsed': 'Budget used',
  'agentWorkspacePage.chainOfThoughtIsNeverDisplayedRequestedOrStored':
    'Chain-of-thought is never displayed, requested or stored — the answer is a structured summary or a failed turn.',
  'agentWorkspacePage.conversationWithTheTrainingAgentAnswersSeparateFact':
    'Conversation with the training agent. Answers separate fact from analysis, hypothesis and uncertainty, and every number comes from a deterministic tool.',
  'agentWorkspacePage.dataMarketDataWithAMandatoryProvenance':
    'Data — market data with a mandatory provenance label',
  'agentWorkspacePage.deniedTheRunIsBlockedWithAReason':
    'Denied: the run is blocked with a reason, and the attempt stays visible in the audit trail.',
  'agentWorkspacePage.fetchFromTheWeb': 'Fetch from the web',
  'agentWorkspacePage.historyRecentTurnsUnderATokenBudget':
    'History — recent turns under a token budget',
  'agentWorkspacePage.ideaEvaluationHumanApproval': 'Idea → evaluation → human approval',
  'agentWorkspacePage.instructionsVersionedNeverDropped': 'Instructions — versioned, never dropped',
  'agentWorkspacePage.liveTradingDisabled': 'Live trading: disabled',
  'agentWorkspacePage.memoryProvenanceRequiredUnverifiedLabelledUncertaint':
    'Memory — provenance required, unverified labelled uncertainty',
  'agentWorkspacePage.messageToTheTrainingAgent': 'Message to the training agent',
  'agentWorkspacePage.modelAuthoredMemoryCanNeverBecomeTrustedKnowledge':
    'Model-authored memory can never become trusted knowledge',
  'agentWorkspacePage.modelOutputNeverBecomesActionDirectly':
    'Model output never becomes action directly',
  'agentWorkspacePage.modelReturnsAToolCallRequestArgumentsOnly':
    'Model returns a tool-call request (arguments only).',
  'agentWorkspacePage.orchestratorChecksTheOperationAgainstThePermissionTa':
    'Orchestrator checks the operation against the permission table.',
  'agentWorkspacePage.provider': 'Provider',
  'agentWorkspacePage.requestsAreRefusedOnceTheMonthlyBudgetIs':
    'Requests are refused once the monthly budget is spent.',
  'agentWorkspacePage.scriptedOfflineAdapterRemainsTheDeterministicDefault':
    'Scripted offline adapter remains the deterministic default.',
  'agentWorkspacePage.sendingIsDisabledNoProviderIsRegisteredAnd':
    'Sending is disabled: no provider is registered, and the interface must not imply a working model. The agent may request tools, but only the orchestrator runs them, after a permission check, and every result is recorded with provenance.',
  'agentWorkspacePage.theAgentCallsDeterministicLocalToolsOnlyIt':
    'The agent calls deterministic local tools only. It has no network access.',
  'agentWorkspacePage.theOrchestratorPermissionChecksAndToolRegistryAre':
    'The orchestrator, permission checks and tool registry are built, but no hosted provider is registered in this phase, so the conversation below is a static example.',
  'agentWorkspacePage.theToolRegistryIsDeclaredInTheBackend':
    'The tool registry is declared in the backend. Nothing on this screen can widen it.',
  'agentWorkspacePage.thisConversationHasNoTurnsYet': 'This conversation has no turns yet',
  'agentWorkspacePage.waitingForAStructuredAnswer': 'Waiting for a structured answer',
  'agentWorkspacePage.whatTheAgentCannotDoWhateverItSays':
    'What the agent cannot do, whatever it says',
  'agentWorkspacePage.whatTheOrchestratorWouldAssemble': 'What the orchestrator would assemble',
  'agentWorkspacePage.whileATurnIsInFlightTheAnswer':
    'While a turn is in flight the answer area holds its shape; no partial sentence is rendered, because a half-arrived claim can read as a finished one.',
  // analysisReadinessPanel ──────────────────────────────────────
  'analysisReadinessPanel.conflicting': 'Conflicting',
  'analysisReadinessPanel.inputsConsidered': 'Inputs considered',
  'analysisReadinessPanel.invalid': 'Invalid',
  'analysisReadinessPanel.noFindingsEveryInputThisAnalysisConsumesIs':
    'No findings: every input this analysis consumes is present, well-formed and current.',
  'analysisReadinessPanel.outOfDate': 'Out of date',
  'analysisReadinessPanel.required': 'Required',
  'analysisReadinessPanel.satisfied': 'Satisfied',
  // analyticsPanel ──────────────────────────────────────────────
  'analyticsPanel.aRisingCurveIsHistoryItIsA':
    'A rising curve is history. It is a record of what happened, not a forecast of what will.',
  'analyticsPanel.consistentRiskIsWhatMakesAnRMultiple':
    'Consistent risk is what makes an R multiple comparable between two trades.',
  'analyticsPanel.drawdownIsMeasuredFromEveryHighWaterMarkSo':
    'Drawdown is measured from every high-water mark, so a new high resets it to zero.',
  'analyticsPanel.equityPerTradeResultAndTheDistanceBelowThe':
    'Equity, per-trade result and the distance below the high-water mark.',
  'analyticsPanel.expectancyEarlyInASampleMovesForArithmetic':
    'Expectancy early in a sample moves for arithmetic reasons, not for strategic ones.',
  'analyticsPanel.highWaterMark': 'high-water mark',
  'analyticsPanel.longAndShortKeptSeparateTheyAre':
    'Long and short, kept separate — they are different samples.',
  'analyticsPanel.openAndIncompleteRecordsAreListedRatherThan':
    'Open and incomplete records are listed rather than excluded, so the bars account for every row.',
  'analyticsPanel.outcomesSizeOfWinsAgainstSizeOfLosses':
    'Outcomes, size of wins against size of losses, and how consistent the risk was.',
  'analyticsPanel.plannedAgainstRealisedPerSetup': 'Planned against realised, per setup.',
  'analyticsPanel.theSessionASetupIsTakenInIs':
    "The session a setup is taken in is part of the setup's evidence.",
  'analyticsPanel.whatWasPlannedAgainstWhatTheRecordsRealised':
    'What was planned against what the records realised, by setup.',
  'analyticsPanel.whereTheResultsCameFromSampleSizeIs':
    'Where the results came from. Sample size is reported before any rate.',
  // answerOption ────────────────────────────────────────────────
  'answerOption.correct': 'Correct',
  'answerOption.incorrect': 'Incorrect',
  'answerOption.partiallyCorrect': 'Partially correct',
  // backgroundTaskPanel ─────────────────────────────────────────
  'backgroundTaskPanel.active': 'Active',
  'backgroundTaskPanel.all': 'All',
  'backgroundTaskPanel.finished': 'Finished',
  'backgroundTaskPanel.needsAttention': 'Needs attention',
  // badge ───────────────────────────────────────────────────────
  'badge.historical': 'Historical',
  'badge.liveNotEnabled': 'Live (not enabled)',
  // brand ───────────────────────────────────────────────────────
  'brand.masterTrade': 'Master Trade',
  // capabilities ────────────────────────────────────────────────
  'capabilities.howARequestIsHandled': 'How a request is handled',
  'capabilities.ifItDoesNotPass': 'If it does not pass:',
  'capabilities.modules': 'Modules',
  'capabilities.provenanceRequirement': 'Provenance requirement',
  'capabilities.requiredBeforeAFigureExists': 'Required before a figure exists',
  'capabilities.whatThisClaimsAndWhatIt': 'What this claims, and what it does not',
  // capabilityPanels ────────────────────────────────────────────
  'capabilityPanels.availability': 'Availability',
  'capabilityPanels.deterministicEngine': 'Deterministic engine',
  'capabilityPanels.memoryItMayCite': 'Memory it may cite',
  'capabilityPanels.meteredAs': 'Metered as',
  'capabilityPanels.operationTheRoleTableDecides': 'Operation the role table decides',
  'capabilityPanels.outputs': 'Outputs',
  'capabilityPanels.theOrderTheServerAppliesAndWhatStops':
    'The order the server applies, and what stops a request at each stage. It is declared once and served, so the description and the behaviour cannot drift.',
  'capabilityPanels.whatEachModuleContributesAndWhichCapabilitiesCompose':
    'What each module contributes, and which capabilities compose it. The registry refuses a module that no capability uses.',
  'capabilityPanels.whoMayAsk': 'Who may ask',
  // chartAdapter ────────────────────────────────────────────────
  'chartAdapter.anEmptyChartIsAFactAboutThe':
    'An empty chart is a fact about the data, not a flat market.',
  'chartAdapter.nothingToPlotForThisSymbolAndTimeframe':
    'Nothing to plot for this symbol and timeframe',
  'chartAdapter.theProviderReturnedNoBarsSoTheChart':
    'The provider returned no bars, so the chart is left empty rather than drawn from a placeholder series.',
  // charts ──────────────────────────────────────────────────────
  'charts.high': 'high',
  'charts.illustrativeRenderTheChartingLibraryIs':
    'Illustrative render — the charting library is not installed in this phase. The adapter keeps provenance and read-only guarantees in one place.',
  'charts.last': 'last',
  'charts.low': 'low',
  // clarifyingPrompts ───────────────────────────────────────────
  'clarifyingPrompts.everyRequiredFieldHasAValueYouGave':
    'Every required field has a value you gave us, and none has aged out yet.',
  // client ──────────────────────────────────────────────────────
  'client.authenticating': 'Authenticating…',
  'client.disconnected': 'Disconnected.',
  'client.disconnectedReconnectToResumeTheEventStream':
    'Disconnected. Reconnect to resume the event stream.',
  // concentrationRiskCard ───────────────────────────────────────
  'concentrationRiskCard.effectivePositions': 'Effective positions',
  'concentrationRiskCard.fiveLargestCombined': 'Five largest combined',
  'concentrationRiskCard.herfindahlHirschmanIndex01': 'Herfindahl–Hirschman index, 0–1',
  'concentrationRiskCard.largestSingle': 'Largest single',
  'concentrationRiskCard.positionsInSet': 'Positions in set',
  'concentrationRiskCard.threeLargestCombined': 'Three largest combined',
  'concentrationRiskCard.topFive': 'Top five',
  'concentrationRiskCard.topPosition': 'Top position',
  'concentrationRiskCard.topThree': 'Top three',
  // connectionStatus ────────────────────────────────────────────
  'connectionStatus.authenticating': 'Authenticating',
  'connectionStatus.connecting': 'Connecting',
  'connectionStatus.live': 'Live',
  'connectionStatus.notConnected': 'Not connected',
  'connectionStatus.notPermitted': 'Not permitted',
  'connectionStatus.offline': 'Offline',
  'connectionStatus.preparing': 'Preparing',
  'connectionStatus.reconnecting': 'Reconnecting',
  // dashboard ───────────────────────────────────────────────────
  'dashboard.aResultNeverActivatesARule': 'A result never activates a rule by itself.',
  'dashboard.attempted': 'attempted',
  'dashboard.attempts': 'attempts',
  'dashboard.chartAdapter': 'chart adapter',
  'dashboard.complete': 'complete ·',
  'dashboard.consistentReviewHabit11ConsecutiveDays':
    'Consistent review habit: 11 consecutive days with a written session.',
  'dashboard.dashboardSections': 'Dashboard sections',
  'dashboard.emptyState': 'Empty state',
  'dashboard.examAverageDippedOnTheSecond':
    'Exam average dipped on the second risk module attempt.',
  'dashboard.examPerformance': 'Exam performance',
  'dashboard.growthIsNotMasteryUnverifiedRows':
    'Growth is not mastery: unverified rows still count.',
  'dashboard.knowledgeAssessmentAndResearch': 'Knowledge, assessment and research',
  'dashboard.knowledgeMastery': 'Knowledge mastery',
  'dashboard.loadingState': 'Loading state',
  'dashboard.memoryGrowth': 'Memory growth',
  'dashboard.mock': 'mock',
  'dashboard.noSessionsRecordedYet': 'No sessions recorded yet',
  'dashboard.oneJournalEntryMissingAnExplicit':
    'One journal entry missing an explicit invalidation level.',
  'dashboard.openExams': 'Open exams',
  'dashboard.openHistory': 'Open history',
  'dashboard.openMemory': 'Open memory',
  'dashboard.openResearch': 'Open research',
  'dashboard.passedOf': 'passed of',
  'dashboard.pending': 'pending',
  'dashboard.previewData': 'Preview data',
  'dashboard.previewGenerated': 'Preview generated',
  'dashboard.recentAgentAndSystemEvents': 'Recent agent and system events',
  'dashboard.recordsAddedInTheLastMonth': 'Records added in the last month',
  'dashboard.recordsVerified': 'records verified',
  'dashboard.researchProgress': 'Research progress',
  'dashboard.riskFirstFramingAppearsInEvery':
    'Risk-first framing appears in every journal entry this month.',
  'dashboard.rubricScoredNeverModelJudged': 'Rubric-scored, never model-judged.',
  'dashboard.running': 'running',
  'dashboard.scheduledEvaluationHasNotRun': 'Scheduled evaluation has not run',
  'dashboard.skeletonsAreUsedWhileAQuery':
    'Skeletons are used while a query is in flight; the pulse respects prefers-reduced-motion.',
  'dashboard.strengths': 'Strengths',
  'dashboard.theShapeOfTheActivityLog':
    'The shape of the activity log: correlation id, actor, event, evidence',
  'dashboard.tradesEvaluated': 'trades evaluated',
  'dashboard.trainingDashboard': 'Training dashboard',
  'dashboard.trainingEquityCurve': 'Training equity curve',
  'dashboard.verifiedMeansAHumanOrTool': 'Verified means a human or tool checked it.',
  'dashboard.vsPrevious30Days': 'vs. previous 30 days',
  'dashboard.watchList': 'Watch list',
  // dashboardPage ───────────────────────────────────────────────
  'dashboardPage.completedLessonsAndGradedExamsWillAppearHere':
    'Completed lessons and graded exams will appear here as soon as the persistence slice lands.',
  'dashboardPage.emptyIsAValidStateItIs': 'Empty is a valid state — it is stated, not hidden.',
  'dashboardPage.overview': 'Overview',
  'dashboardPage.progressStudyMetricsAndReadOnlyChartsEveryFigure':
    'Progress, study metrics and read-only charts. Every figure below is illustrative preview data typed against the backend view models.',
  'dashboardPage.reloadsTheLayoutSkeletonNoJobIsQueued':
    'Reloads the layout skeleton. No job is queued in this phase.',
  'dashboardPage.rollUpsFromTheProductModulesEachFigureIs':
    'Roll-ups from the product modules. Each figure is illustrative and each card states what it cannot tell you.',
  'dashboardPage.stateExamples': 'State examples',
  'dashboardPage.theEvaluationHarnessIsInPlaceTheScheduler':
    'The evaluation harness is in place; the scheduler that enqueues it arrives with the durable job queue.',
  'dashboardPage.thisDashboardIsNotConnectedToTheBackend':
    'This dashboard is not connected to the backend. Progress, metrics and charts are illustrative and typed against the final view models.',
  // data ────────────────────────────────────────────────────────
  'data.aWrittenEvidenceBackedProcessOfYourOwn': 'A written, evidence-backed process of your own.',
  'data.acrossTheSixMonthCurriculum': 'Across the six-month curriculum',
  'data.anthropic': 'Anthropic',
  'data.chartReading': 'Chart Reading',
  'data.consecutiveDaysWithACompletedReviewSession':
    'Consecutive days with a completed review session',
  'data.contextAssembly': 'Context assembly',
  'data.deterministicDefaultUsedWhenNoHostedProviderIs':
    'Deterministic default used when no hosted provider is configured.',
  'data.draftKeptAsACounterExampleTheReasonTo':
    'Draft. Kept as a counter-example: the reason to skip a trade is also a record.',
  'data.drawdownControl': 'Drawdown control',
  'data.drawdownYouCanActuallySurvive': 'Drawdown you can actually survive',
  'data.epistemic.analysis': 'Analysis',
  'data.epistemic.fact': 'Fact',
  'data.epistemic.hypothesis': 'Hypothesis',
  'data.epistemic.uncertainty': 'Uncertainty',
  'data.examAverageDippedBelow80InTheLast': 'Exam average dipped below 80% in the last attempt.',
  'data.examGrading': 'Exam grading',
  'data.executionDiscipline': 'Execution Discipline',
  'data.expectancy': 'Expectancy',
  'data.expectancySampleSizeAndWhySmallSamplesLie':
    'Expectancy, sample size and why small samples lie.',
  'data.fixedFractionalSizing': 'Fixed-fractional sizing',
  'data.humanApprovedChanges': 'Human-approved changes',
  'data.hypothesisTradersWhoFixRiskFirstTendTo':
    'Hypothesis: traders who fix risk first tend to reduce decision fatigue later. That is a testable claim about your process, not a market prediction, and it should be checked against your own journal before you trust it.',
  'data.independentOperator': 'Independent Operator',
  'data.invalidationLevelWrittenDown': 'Invalidation level written down',
  'data.journalEntries': 'Journal entries',
  'data.journaling': 'Journaling',
  'data.keysAreStoredInTheOSKeychainConfiguration':
    'Keys are stored in the OS keychain; configuration only ever holds a reference.',
  'data.marketMechanicsVocabulary': 'Market Mechanics & Vocabulary',
  'data.meanOfYourBestScorePerExamination': 'Mean of your best score per examination',
  'data.mockDataNotice':
    'Illustrative data for layout review. Nothing on this screen is connected to a backend, a model or a market feed.',
  'data.module2AvailableAfterModule1Completion': 'Module 2 available after module 1 completion',
  'data.module2UnlockedRiskFirst': 'Module 2 unlocked: Risk First.',
  'data.openAI': 'OpenAI',
  'data.orderTypesTheoryOnly': 'Order types (theory only)',
  'data.ordersSpreadsSessionsAndTheLanguageOfPrice':
    'Orders, spreads, sessions and the language of price.',
  'data.outOfSampleCaution': 'Out-of-sample caution',
  'data.positionSizeFromDeterministicTool': 'Position size from deterministic tool',
  'data.positionSizingRMultiplesAndSurvivableLoss':
    'Position sizing, R-multiples and survivable loss.',
  'data.postEarningsGapContinuation': 'Post-earnings gap continuation',
  'data.postTradeReview': 'Post-trade review',
  'data.preTradeChecklist': 'Pre-trade checklist',
  'data.processJournalingAndReviewInsteadOfPrediction':
    'Process, journaling and review instead of prediction.',
  'data.pullbackToPriorSupportRiskDefined': 'Pullback to prior support, risk defined',
  'data.rMultiples': 'R-multiples',
  'data.rangeEdgeLowConviction': 'Range edge, low conviction',
  'data.responseLabelledWithFactAnalysisHypothesis':
    'Response labelled with fact / analysis / hypothesis / uncertainty',
  'data.reviewStreak': 'Review streak',
  'data.reviewedAgainstTheMonth2ChecklistProcessNotes':
    'Reviewed against the month 2 checklist. Process notes only — no outcome claimed.',
  'data.riskDefinedBeforeEntry': 'Risk defined before entry',
  'data.riskFirst': 'Risk First',
  'data.riskPositionSizeNotYetConnected': 'risk.positionSize (not yet connected)',
  'data.riskPositionSizeRequestedPermissionCheckAndExecution':
    'risk.positionSize requested — permission check and execution are orchestrator-owned',
  'data.riskToolUsage': 'Risk-tool usage',
  'data.scriptedOffline': 'Scripted (offline)',
  'data.secondProviderExistsToProveTheGatewayIs':
    'Second provider exists to prove the gateway is provider-independent.',
  'data.sessions': 'Sessions',
  'data.statisticsOfOutcomes': 'Statistics of Outcomes',
  'data.streaksAndConsistency': 'Streaks and consistency',
  'data.structureLevelsAndContextBeforePatternNames':
    'Structure, levels and context before pattern names.',
  'data.supportResistance': 'Support & resistance',
  'data.thinkingInRInsteadOfCurrency': 'Thinking in R instead of currency',
  'data.trendStructure': 'Trend structure',
  'data.uncertaintyNothingHereTellsYouWhetherThisSetup':
    'Uncertainty: nothing here tells you whether this setup will work. Sample size is one, and a single outcome carries no statistical weight.',
  'data.volumeContext': 'Volume context',
  'data.waitingForReviewElevatedVolatilityMeansWiderStops':
    'Waiting for review. Elevated volatility means wider stops and smaller size.',
  'data.writtenPlan': 'Written plan',
  'data.writtenReviewsNotPredictions': 'Written reviews, not predictions',
  // dataQualityBadge ────────────────────────────────────────────
  'dataQualityBadge.absent': 'Absent',
  'dataQualityBadge.computedFromValuesYouGaveByDeterministicCode':
    'Computed from values you gave, by deterministic code rather than by a model.',
  'dataQualityBadge.insideTheFreshnessWindowForThisKindOf':
    'Inside the freshness window for this kind of input.',
  'dataQualityBadge.itWasUsableAndHasAgedPastThe':
    'It was usable and has aged past the window for this kind of input.',
  'dataQualityBadge.noObservationTimeSoItCannotBeAssessed':
    'No observation time, so it cannot be assessed for recency and is treated as an assumption.',
  'dataQualityBadge.notAUsableValueOfItsDeclaredKind':
    'Not a usable value of its declared kind, so it has to be corrected.',
  'dataQualityBadge.notProvidedItIsNeverTreatedAsA':
    'Not provided. It is never treated as a fact and never pre-filled.',
  'dataQualityBadge.nothingIsStoredForThisInput': 'Nothing is stored for this input.',
  'dataQualityBadge.nothingIsStoredForThisInputAndAn':
    'Nothing is stored for this input, and an analysis that needs it cannot run.',
  'dataQualityBadge.nothingWasPresentToCheck': 'Nothing was present to check.',
  'dataQualityBadge.presentButItsProvenanceIsNotRecordedWell':
    'Present, but its provenance is not recorded well enough to weigh it.',
  'dataQualityBadge.theValueIsAWellFormedValueOfIts':
    'The value is a well-formed value of its declared kind.',
  'dataQualityBadge.thisBuildDoesNotKnowThisTokenSo':
    'This build does not know this token, so it is shown exactly as it was sent.',
  'dataQualityBadge.unchecked': 'Unchecked',
  'dataQualityBadge.undated': 'Undated',
  'dataQualityBadge.valid': 'Valid',
  'dataQualityBadge.youGaveThisValueAndItIsInside':
    'You gave this value, and it is inside its freshness window.',
  // decisions ───────────────────────────────────────────────────
  'decisions.actual': 'Actual',
  'decisions.appendOnlyEachRowNamesThe':
    'Append-only. Each row names the rule that produced the verdict and the version it read; the figures themselves are recomputed whenever they are shown.',
  'decisions.assumptionsThisReadingRestsOn': 'Assumptions this reading rests on',
  'decisions.confidence.assumed': 'Assumed',
  'decisions.confidence.confirmed': 'Confirmed',
  'decisions.confidence.derived': 'Derived',
  'decisions.confidence.missing': 'Missing',
  'decisions.difference': 'Difference',
  'decisions.evaluationHistory': 'Evaluation history',
  'decisions.evaluationReadiness': 'Evaluation readiness',
  'decisions.expected': 'Expected',
  'decisions.expectedVersusActual': 'Expected versus actual',
  'decisions.keptInTheFlowOfThe':
    'Kept in the flow of the figures rather than folded away: a number read without these is a different number.',
  'decisions.limitationsAndAssumptions': 'Limitations and assumptions',
  'decisions.noFigureExistsForThisRecord':
    'No figure exists for this record, and the reasons are listed below rather than shown as zeroes.',
  'decisions.noFindingsTheRecordIsComplete':
    'No findings. The record is complete enough to measure, and the window is the one it declares.',
  'decisions.notAResult': '— not a result',
  'decisions.notEvaluated': 'Not evaluated',
  'decisions.notEvaluatedYet': 'Not evaluated yet',
  'decisions.observations': 'Observations',
  'decisions.outcome': 'Outcome',
  'decisions.readiness': 'Readiness',
  'decisions.reason': 'Reason',
  'decisions.recorded': '· recorded',
  'decisions.reportedForTheReturnOnly': 'reported for the return only',
  'decisions.theRecordItself': 'the record itself',
  'decisions.v': 'v',
  'decisions.version': 'Version',
  'decisions.whatTheRecordSaysHappened': 'What the record says happened',
  'decisions.whatWouldChangeTheAnswer': 'What would change the answer',
  'decisions.whatYouSaidYouExpectedAnd':
    'What you said you expected, and what the record says happened. The comparison is only made when both sides exist and the actual side is a real outcome.',
  'decisions.when': 'When',
  'decisions.window': 'Window',
  'decisions.yourDeclaredContext': 'Your declared context',
  'decisions.yourRationaleAsYouRecordedIt': 'Your rationale, as you recorded it',
  // evaluation ──────────────────────────────────────────────────
  'evaluation.aRequestNamingACapabilityNobody':
    'A request naming a capability nobody declared is refused at resolution, before any input is read — capabilities are deny-by-default, so an undeclared id has no implementation to reach.',
  'evaluation.capabilities': 'Capabilities',
  'evaluation.couldNotReadTheCapabilityCatalogue': 'Could not read the capability catalogue',
  'evaluation.couldNotReadTheDecision': 'Could not read the decision',
  'evaluation.couldNotReadYourDecisions': 'Could not read your decisions',
  'evaluation.decidedBy': '· decided by',
  'evaluation.declared': 'declared ·',
  'evaluation.description':
    'Record what you decided, see what the recorded prices say happened — and what could not be measured — and read what the platform claims it can and cannot do with it. Nothing here is predicted, and no decision is graded.',
  'evaluation.eachStateIsComputedOnThe':
    'Each state is computed on the server from your own declarations and from what the capability declares it needs. Availability and readiness are separate claims, so a capability that is not built says so instead of asking you for inputs it could not use.',
  'evaluation.evaluationRecorded': 'Evaluation recorded',
  'evaluation.evaluationSections': 'Evaluation sections',
  'evaluation.inputs': 'Inputs:',
  'evaluation.modules': 'modules',
  'evaluation.noCapabilityCatalogueToShow': 'No capability catalogue to show',
  'evaluation.noCapabilityHerePlacesAnOrder':
    'No capability here places an order, connects a broker or runs live. There is no operation for one, no plan includes one, and the engine has no tool behind one.',
  'evaluation.noDecisionsToShow': 'No decisions to show',
  'evaluation.notEvaluatedTheReasonsAreBelow': 'Not evaluated — the reasons are below',
  'evaluation.readinessPerAnalysis': 'Readiness per analysis',
  'evaluation.refresh': 'Refresh',
  'evaluation.refreshTheDecisionList': 'Refresh the decision list',
  'evaluation.selectADecision': 'Select a decision',
  'evaluation.whatIsDeliberatelyAbsent': 'What is deliberately absent',
  'evaluation.whatThisAccountCanDoRight': 'What this account can do right now',
  // evaluationPage ──────────────────────────────────────────────
  'evaluationPage.aDecisionIsARecordOfYourReasoning':
    'A decision is a record of your reasoning, not a trade order. Nothing on this page can place one.',
  'evaluationPage.decisions': 'Decisions',
  'evaluationPage.decisionsAreRecordedThroughTheAPIWithThe':
    'Decisions are recorded through the API with the prices, the risk you planned and what you expected. Once one exists, this page measures what its own prices say happened.',
  'evaluationPage.eachOneDeclaresTheInputsItIsGated':
    'Each one declares the inputs it is gated by, the operation the role table decides, the engine that computes its figures, and what it claims — including what it does not.',
  'evaluationPage.itsRecordTheReadinessVerdictFromBothGates':
    'Its record, the readiness verdict from both gates, and the evaluation computed from the prices on the record.',
  'evaluationPage.theGateSVerdictForEveryDeclaredAnalysisType':
    "The gate's verdict for every declared analysis type, from your own context. Nothing here is decided by a model.",
  // evaluationPanels ────────────────────────────────────────────
  'evaluationPanels.askingForAnEvaluationAppendsARowHere':
    'Asking for an evaluation appends a row here. Nothing is overwritten, so a changed figure is explained by two rows rather than by one that was edited.',
  'evaluationPanels.currency': 'Currency',
  'evaluationPanels.eachEvaluationThisDecisionHasHadWithThe':
    'Each evaluation this decision has had, with the rule that produced it',
  'evaluationPanels.entry': 'Entry',
  'evaluationPanels.exit': 'Exit',
  'evaluationPanels.expectedR': 'Expected R',
  'evaluationPanels.expectedReturn': 'Expected return',
  'evaluationPanels.notMeasurable': 'not measurable',
  'evaluationPanels.notStated': 'not stated',
  'evaluationPanels.plannedRisk': 'Planned risk',
  'evaluationPanels.rMultiple': 'R multiple',
  'evaluationPanels.readingsTheEngineDerivedEachWithTheMetrics':
    'Readings the engine derived, each with the metrics it rests on and what it does not cover.',
  'evaluationPanels.return': 'Return',
  'evaluationPanels.windowCloses': 'Window closes',
  'evaluationPanels.windowOpens': 'Window opens',
  // examCard ────────────────────────────────────────────────────
  'examCard.attemptProgress': 'Attempt progress',
  'examCard.noExamServiceIsConnectedInThisPhase':
    'No exam service is connected in this phase, so this action is inert.',
  // exams ───────────────────────────────────────────────────────
  'exams.aHighWinRateWithNegativeExpectancyStill':
    'A high win rate with negative expectancy still loses money; the rubric scores the distinction, not the arithmetic.',
  'exams.aMeanAcrossDifferentExamsIs':
    'A mean across different exams is a study signal, not a grade.',
  'exams.aRiskBudgetIsDefinedInCurrencyBefore':
    'A risk budget is defined in currency before an entry is considered. What does the budget determine first?',
  'exams.aStopInsideTheNoiseRangeIsA':
    'A stop inside the noise range is a decision to be stopped out, not a risk limit.',
  'exams.abandonedPartWayThroughABlankIs':
    'Abandoned part way through — a blank is recorded as void, never as zero.',
  'exams.acrossAttempts': 'across attempts',
  'exams.action.available': 'Start assessment',
  'exams.action.completed': 'Review answers',
  'exams.action.failed': 'Retry assessment',
  'exams.action.in-progress': 'Resume attempt',
  'exams.action.locked': 'Locked',
  'exams.assessmentProgress': 'Assessment progress',
  'exams.assessmentStates': 'Assessment states',
  'exams.attempt': '· attempt',
  'exams.attemptContext': 'Attempt context',
  'exams.attemptHistory': 'Attempt history',
  'exams.attempted': 'attempted ·',
  'exams.attemptsRecorded': 'attempts recorded',
  'exams.attemptsToPass': 'Attempts to pass',
  'exams.availableNow': 'Available now',
  'exams.averageBestScore': 'Average best score',
  'exams.averageBestScore2': 'average best score',
  'exams.best': 'Best',
  'exams.bestScore': 'best score',
  'exams.byEvidence': 'By evidence',
  'exams.byLesson': 'By lesson',
  'exams.byPattern': 'By pattern',
  'exams.closestAttemptSoFarGapsAreConcentrationNot':
    'Closest attempt so far; gaps are concentration, not raw error.',
  'exams.confusingExpectancyWithWinRate': 'Confusing expectancy with win rate',
  'exams.currentAssessment': 'Current assessment',
  'exams.empty': 'Empty',
  'exams.enforcedServerSide': 'enforced server-side',
  'exams.error': 'Error',
  'exams.everyAttemptIsRetainedIncludingThe':
    'Every attempt is retained, including the ones that were void',
  'exams.everyPatternPointsBackToThe':
    'Every pattern points back to the lesson that teaches it, so review has a destination.',
  'exams.exam': 'Exam',
  'exams.examCategories': 'Exam categories',
  'exams.examGradingPolicy':
    'Grading is rubric-based and deterministic: the backend scores each answer against the rubric and the model only explains. Pass/fail is never a model opinion.',
  'exams.examIntegrityPolicy':
    'The answer key never reaches the client before submission. Questions below are shape only: every one is marked as withheld.',
  'exams.examPreviewNotice':
    'Illustrative assessment data. No exam runner, grader or answer key is connected in this phase — scores shown are layout examples, not results.',
  'exams.examState.available': 'Available',
  'exams.examState.completed': 'Completed',
  'exams.examState.failed': 'Failed',
  'exams.examState.in-progress': 'In progress',
  'exams.examState.locked': 'Locked',
  'exams.examinationSections': 'Examination sections',
  'exams.examinations': 'Examinations',
  'exams.example': 'example',
  'exams.exams': 'exams',
  'exams.executionDiscipline': 'Execution discipline',
  'exams.expectancyAndTheSmallSampleTrap': 'Expectancy and the small-sample trap',
  'exams.expectancySampleSizeOutOfSampleCaution': 'Expectancy, sample size, out-of-sample caution',
  'exams.firstAttemptSizingQuestionsAnsweredInCurrencyRather':
    'First attempt; sizing questions answered in currency rather than R.',
  'exams.fixedFractionalPositionSizing': 'Fixed-fractional position sizing',
  'exams.gradedAgainst': 'Graded against',
  'exams.gradingJobHasNotRun': 'Grading job has not run',
  'exams.howAGradedAnswerIsDisplayed':
    'How a graded answer is displayed, after the server returns verdicts',
  'exams.howSessionOverlapChangesWhatAFillActually':
    'How session overlap changes what a fill actually costs.',
  'exams.improvedStillBelowThePassScore': 'Improved, still below the pass score.',
  'exams.inOneParagraphExplainWhyA12TradeWinning':
    'In one paragraph, explain why a 12-trade winning streak is not evidence of an edge.',
  'exams.integrityRules': 'Integrity rules',
  'exams.isComplete': 'is complete.',
  'exams.itMakesTwoDifferentSymbolsComparable': 'It makes two different symbols comparable',
  'exams.itRemovesTheNeedForAStop': 'It removes the need for a stop',
  'exams.itSeparatesDecisionQualityFromPositionSize':
    'It separates decision quality from position size',
  'exams.keyWithheld': 'key withheld',
  'exams.kind.multi-choice': 'Multiple choice',
  'exams.kind.numeric': 'Numeric',
  'exams.kind.single-choice': 'Single choice',
  'exams.kind.written': 'Written',
  'exams.lastSeen': '· last seen',
  'exams.loading': 'Loading',
  'exams.locked': 'locked',
  'exams.lockedByPrerequisiteWithTheDependency':
    'Locked by prerequisite, with the dependency named',
  'exams.lockedExaminations': 'Locked examinations',
  'exams.m': 'm',
  'exams.m2': 'm ·',
  'exams.meanAcrossPassedExaminations': 'Mean across passed examinations',
  'exams.meanOfGradedAttempts': 'mean of graded attempts',
  'exams.meanOfTheBestScorePer': 'Mean of the best score per examination',
  'exams.misses': 'misses ·',
  'exams.mistakeAnalysis': 'Mistake analysis',
  'exams.mistakesAreGroupedByTheRule':
    'Mistakes are grouped by the rule that was broken, not by the question they appeared in.',
  'exams.nextQuestion': 'Next question',
  'exams.noAttemptsInThisCategory': 'No attempts in this category',
  'exams.normalisingOutcomesSoTheyCanBeComparedAcross':
    'Normalising outcomes so they can be compared across symbols.',
  'exams.notAStoredHistory': 'Not a stored history',
  'exams.nothingMissedYet': 'Nothing missed yet',
  'exams.nothingOnThisScreenGradesStores':
    'Nothing on this screen grades, stores or submits an answer.',
  'exams.of': 'of',
  'exams.ofMisses': 'of misses',
  'exams.openReviewPlan': 'Open review plan',
  'exams.partialCreditIsExpressedPerRubric':
    'Partial credit is expressed per rubric criterion, so a written answer can be marked partially correct instead of all-or-nothing.',
  'exams.passAt': 'Pass at',
  'exams.passAt2': '· pass at',
  'exams.passed': 'passed ·',
  'exams.passedAfterReworkingTheSizingLesson': 'Passed after reworking the sizing lesson.',
  'exams.passedOnTheFirstAttempt': 'Passed on the first attempt.',
  'exams.patternsComeFromStoredAttemptResults':
    'Patterns come from stored attempt results, never from a model summary.',
  'exams.placingTheInvalidationLevelInsideNormalNoise':
    'Placing the invalidation level inside normal noise',
  'exams.pointsBackTo': 'Points back to',
  'exams.postSubmissionReview': 'Post-submission review',
  'exams.previewAssessmentData': 'Preview assessment data',
  'exams.previous': 'Previous',
  'exams.processJournalingReview': 'Process, journaling, review',
  'exams.processOmissionRatherThanAKnowledgeGapThe':
    'Process omission rather than a knowledge gap: the checklist answer was correct, the journal practice was not.',
  'exams.processReview': 'Process review',
  'exams.question': 'Question',
  'exams.questions': 'Questions',
  'exams.requires': 'requires',
  'exams.resumeAttempt': 'Resume attempt',
  'exams.retriesAreKeptAFailedAttempt':
    'Retries are kept. A failed attempt is evidence about which lesson to rework, not a penalty.',
  'exams.review': 'review',
  'exams.reviewDisciplineAfterALoss': 'Review discipline after a loss',
  'exams.riskPerTradeBeforeRewardPer': 'Risk per trade before reward per trade',
  'exams.roundingAUnitCountUpInsteadOfDown': 'Rounding a unit count up instead of down',
  'exams.roundingDirectionWrongInFourOfFiveSizing':
    'Rounding direction wrong in four of five sizing questions.',
  'exams.roundingUpSilentlyExceedsTheStatedRiskBudget':
    'Rounding up silently exceeds the stated risk budget — the error is in the size, not the answer.',
  'exams.separatingABadOutcomeFromABadDecision': 'Separating a bad outcome from a bad decision.',
  'exams.serverGraded': 'server-graded',
  'exams.sessionsLevelsContextBeforePatterns': 'Sessions, levels, context before patterns',
  'exams.sessionsSpreadsAndTheCostOfImpatience': 'Sessions, spreads and the cost of impatience',
  'exams.sharesAreComputedAgainstTheNumber':
    'Shares are computed against the number of incorrect answers, so the denominator is never hidden.',
  'exams.sizingRMultiplesSurvivableLoss': 'Sizing, R-multiples, survivable loss',
  'exams.skeletonsWhileAnAttemptIsFetched':
    'Skeletons while an attempt is fetched; the pulse respects prefers-reduced-motion.',
  'exams.skippingTheWrittenInvalidationLevel': 'Skipping the written invalidation level',
  'exams.started': 'Started',
  'exams.statisticsOfOutcomes': 'Statistics of outcomes',
  'exams.theDirectionOfTheTrade': 'The direction of the trade',
  'exams.theNumberOfUnitsFromStopDistanceAnd': 'The number of units, from stop distance and budget',
  'exams.theRewardTarget': 'The reward target',
  'exams.theRulesThisInterfaceFollows': 'The rules this interface follows',
  'exams.theWrittenPreTradeChecklist': 'The written pre-trade checklist',
  'exams.time': 'Time',
  'exams.timeLimit': 'Time limit',
  'exams.timingIsEnforcedByTheService':
    'Timing is enforced by the service, not the client, so closing the window cannot extend an attempt.',
  'exams.turningARiskBudgetIntoAUnitCount':
    'Turning a risk budget into a unit count without rounding up.',
  'exams.unlocksWhen': 'Unlocks when',
  'exams.verdictsArriveWithTheServerS':
    "Verdicts arrive with the server's explanation and are attached to the attempt, so the same review is reproducible later.",
  'exams.whatAChecklistMustContainToBeWorth': 'What a checklist must contain to be worth keeping.',
  'exams.whatAnAssessmentGuarantees': 'What an assessment guarantees',
  'exams.whatTheReviewIsFor': 'What the review is for',
  'exams.whatTheRunnerWouldKnowAbout': 'What the runner would know about this attempt',
  'exams.whichOfTheseAreValidReasonsToExpress':
    'Which of these are valid reasons to express an outcome in R rather than currency?',
  'exams.whyATenTradeSampleIsNotEvidenceOf': 'Why a ten-trade sample is not evidence of an edge.',
  'exams.whyTheLossSideIsDecidedBeforeThe':
    'Why the loss side is decided before the entry is considered.',
  'exams.writtenPlanEvidenceHumanApprovedChanges': 'Written plan, evidence, human-approved changes',
  // examsPage ───────────────────────────────────────────────────
  'examsPage.anAttemptSubmittedWithoutAGradingJobStays':
    'An attempt submitted without a grading job stays pending and is labelled as pending, not scored.',
  'examsPage.anUntouchedCategoryIsStatedPlainlyRatherThan':
    'An untouched category is stated plainly rather than hidden behind a zero.',
  'examsPage.assessmentScoringAndMistakeReviewAcrossTheSixMonth':
    'Assessment, scoring and mistake review across the six-month curriculum. Grading is rubric-based and deterministic; the model explains results but never decides pass or fail.',
  'examsPage.closestAttempt74': 'closest attempt: 74%',
  'examsPage.directionIsAnInputToTheSetupNot':
    'Direction is an input to the setup, not an output of the risk budget.',
  'examsPage.everyStateTheModuleMustRenderWithThe':
    'Every state the module must render, with the action each one offers.',
  'examsPage.examinationsPassed': 'Examinations passed',
  'examsPage.failuresAndBlanksAreNeverRenderedAsZeroes':
    'Failures and blanks are never rendered as zeroes.',
  'examsPage.groupedByTheCurriculumAreaTheyTestThe':
    'Grouped by the curriculum area they test; the average is illustrative.',
  'examsPage.groupingByCauseTurnsAScoreIntoA': 'Grouping by cause turns a score into a lesson.',
  'examsPage.history': 'History',
  'examsPage.improvedAfterRework': 'improved after rework',
  'examsPage.lockedExaminationsAreExcludedFromWhatIsAchievable':
    'Locked examinations are excluded from what is achievable today.',
  'examsPage.matchesTheRubricTheBudgetAndTheStop':
    'Matches the rubric: the budget and the stop distance set the size.',
  'examsPage.mistakeReview': 'Mistake review',
  'examsPage.partiallyCorrectRewardIsComparedAgainstRiskBut':
    'Partially correct: reward is compared against risk, but it is not what the budget determines first.',
  'examsPage.questionsAnswered': 'Questions answered',
  'examsPage.unlockedAssessmentsOrderedByWhenTheyBecameAvailable':
    'Unlocked assessments, ordered by when they became available.',
  // experimentTimeline ──────────────────────────────────────────
  'experimentTimeline.anExperimentHasNoHistoryUntilAHypothesis':
    'An experiment has no history until a hypothesis is written, so this list starts empty by design.',
  'experimentTimeline.approvalRequested': 'Approval requested',
  'experimentTimeline.evaluationAttached': 'Evaluation attached',
  'experimentTimeline.statusChange': 'Status change',
  // feedbackStates ──────────────────────────────────────────────
  'feedbackStates.aCompletedActionConfirmedItSharesTheBrand':
    'A completed action, confirmed. It shares the brand green and is a distinct fill from it.',
  'feedbackStates.aConfirmationRatherThanAReportTheOnly':
    'A confirmation rather than a report. The only feedback surface allowed a glow, because a decision deserves more weight than a notice.',
  'feedbackStates.aFailureReportedWithItsTypedCodeAs':
    'A failure, reported with its typed code as evidence rather than restated in prose.',
  'feedbackStates.aStatementWithNoVerdictOfItsOwn':
    'A statement with no verdict of its own — context, a count, a note.',
  'feedbackStates.announcedPolitelyInformationDoesNotInterruptWhichIs':
    'Announced politely. Information does not interrupt, which is what keeps an interruption meaningful.',
  'feedbackStates.checkThisBeforeContinuing': 'Check this before continuing',
  'feedbackStates.failure': 'Failure',
  'feedbackStates.information': 'Information',
  'feedbackStates.note': 'Note',
  'feedbackStates.nothingToReport': 'Nothing to report',
  'feedbackStates.proceedAbleButNotSilentlySomethingHereMayNot':
    'Proceed-able, but not silently: something here may not be what was meant.',
  'feedbackStates.raisedThroughTheSharedProviderSoItPauses':
    'Raised through the shared provider, so it pauses when you reach for it.',
  'feedbackStates.success': 'Success',
  'feedbackStates.thatCouldNotBeDone': 'That could not be done',
  'feedbackStates.thatWorked': 'That worked',
  'feedbackStates.thisCannotBeUndone': 'This cannot be undone',
  'feedbackStates.warning': 'Warning',
  'feedbackStates.worthKnowing': 'Worth knowing',
  // holdingsEditor ──────────────────────────────────────────────
  'holdingsEditor.assetClass': 'Asset class',
  'holdingsEditor.averageEntryPrice': 'Average entry price',
  'holdingsEditor.baseCurrency': 'Base currency',
  'holdingsEditor.blankStaysBlankNeverReadAsZero': 'Blank stays blank — never read as zero.',
  'holdingsEditor.cashWeight': 'Cash weight (%)',
  'holdingsEditor.currentPrice': 'Current price',
  'holdingsEditor.declaredWeight': 'Declared weight (%)',
  'holdingsEditor.name': 'Name',
  'holdingsEditor.optionalAndUsedOnlyWhenNoPriceExists':
    'Optional, and used only when no price exists for the position.',
  'holdingsEditor.optionalTheShareHeldAsCashWhenYou':
    'Optional. The share held as cash, when you want it counted.',
  'holdingsEditor.priceObservedAt': 'Price observed at',
  'holdingsEditor.required': 'Required.',
  'holdingsEditor.requiredWithAPriceAnUndatedPriceIs':
    'Required with a price: an undated price is treated as an assumption.',
  // holdingsTable ───────────────────────────────────────────────
  'holdingsTable.declaredPositionsWithTheFiguresComputedFromEach':
    'Declared positions with the figures computed from each one',
  'holdingsTable.notPriced': 'not priced',
  'holdingsTable.nothingHasBeenDeclaredForThisAccountYet':
    "Nothing has been declared for this account yet. Nothing is displayed in place of a holding: an illustrative row would be a factual claim about somebody's money.",
  // inputQualitySummary ─────────────────────────────────────────
  'inputQualitySummary.inputsAssessed': 'Inputs assessed',
  'inputQualitySummary.requiredAndUsable': 'Required and usable',
  // interfaceStates ─────────────────────────────────────────────
  'interfaceStates.aReadThatFailedWithItsTypedReason': 'A read that failed, with its typed reason.',
  'interfaceStates.aSuccessfulReadThatFoundNothing': 'A successful read that found nothing.',
  'interfaceStates.beforeDataArrivesTheLayoutIsAlreadyThe':
    'Before data arrives; the layout is already the right shape.',
  // journal ─────────────────────────────────────────────────────
  'journal.021RVsPrevious14': '+0.21R vs previous 14',
  'journal.044VsPrevious14': '+0.44 vs previous 14',
  'journal.14Scored2StillOpen': '14 scored · 2 still open',
  'journal.14ScoredTrades': '14 scored trades',
  'journal.16RecordsPlannedRisk': '16 records, planned risk',
  'journal.3TradesNotAssessedYet': '3 trades not assessed yet',
  'journal.42PtsVsPrevious14': '+4.2 pts vs previous 14',
  'journal.7WinsIn14ScoredTrades': '7 wins in 14 scored trades',
  'journal.8CompliantOf13Assessed': '8 compliant of 13 assessed',
  'journal.aBreakoutAttemptFailsAndPriceReEntersThe':
    'A breakout attempt fails and price re-enters the range it left.',
  'journal.aDayWhoseRecordsWereNever':
    'A day whose records were never scored reports “not scored” rather than a zero, and a day with no trades is an explicit flat cell rather than a blank one.',
  'journal.aFlatResultAfterAFullStopDistance':
    'A flat result after a full stop distance is a managed loss, not a wasted trade.',
  'journal.aGapHoldsItsOpeningRangeInsteadOf': 'A gap holds its opening range instead of filling.',
  'journal.aLevelBreaksPriceReturnsToItAnd':
    'A level breaks, price returns to it, and the retest holds before continuation.',
  'journal.aRateIsOnlyMeaningfulWithItsSample':
    'A rate is only meaningful with its sample attached.',
  'journal.aRateIsReportedOverAssessed':
    'A rate is reported over assessed records only; unassessed records are shown, not counted as compliant.',
  'journal.aRecordIsAnAppendTo':
    'A record is an append to a journal. It cannot activate a rule, and it cannot reach a broker. Rule changes need an evaluation and a recorded human approval, which are separate surfaces.',
  'journal.aRecordIsNotAResult': 'A record is not a result',
  'journal.aRecordWithNoReviewCannot': 'A record with no review cannot be studied',
  'journal.aReviewIsWrittenFromThe':
    'A review is written from the record, and the record is not edited to fit the review.',
  'journal.aRowRsquoSLeftEdge':
    'A row’s left edge carries its result: green for a win, red for a loss, grey for break-even, blue for an open record. An archived row is dimmed rather than hidden, because an archived record is still the reason a later decision was made.',
  'journal.aRuleBreakAndAnUnscored':
    'A rule break and an unscored record both force a review, whatever the outcome was.',
  'journal.aStreakIsAPropertyOf': 'A streak is a property of a small sample, not of the trader.',
  'journal.aWidenedStopIsASecondDecisionThat':
    'A widened stop is a second decision that was never planned.',
  'journal.aboveThe025RStudyThreshold': 'Above the 0.25R study threshold',
  'journal.actionsOnARecord': 'Actions on a record',
  'journal.after': 'after.',
  'journal.aiReviewNotice':
    'No model provider is connected to the journal in this phase. These panels show the states the review surface must handle; none of them contains a real review, and the completed state is a labelled layout example.',
  'journal.aiReviewState.completed': 'Completed',
  'journal.aiReviewState.failed': 'Failed',
  'journal.aiReviewState.not-available': 'Not available',
  'journal.aiReviewState.pending': 'Pending',
  'journal.aiReviewState.processing': 'Processing',
  'journal.allRecordsInTheCurrentView': 'All records in the current view',
  'journal.anEstablishedTrendPullsIntoAZoneOf':
    'An established trend pulls into a zone of prior demand without breaking structure.',
  'journal.anObviousHighOrLowIsTakenAnd':
    'An obvious high or low is taken and reclaimed within the same impulse.',
  'journal.anUnclosedRecordCannotBeReviewedSoIt':
    'An unclosed record cannot be reviewed, so it cannot teach anything yet.',
  'journal.analyticsTimeframe': 'Analytics timeframe',
  'journal.andKeepsYourValuesInThe':
    'and keeps your values in the form, because a form that says “saved” when nothing was stored is the worst possible behaviour for a journal.',
  'journal.anyMarket': 'Any market',
  'journal.anyResult': 'Any result',
  'journal.anySession': 'Any session',
  'journal.anySetup': 'Any setup',
  'journal.anyState': 'Any state',
  'journal.anyStatus': 'Any status',
  'journal.appendedInOrderNothingHereIs':
    'Appended in order. Nothing here is overwritten, so an earlier reading stays available.',
  'journal.archived': 'archived',
  'journal.assessedSeparatelyFromTheOutcome': 'Assessed separately from the outcome',
  'journal.attachmentKind.analysis': 'Analysis image',
  'journal.attachmentKind.entry': 'Entry screenshot',
  'journal.attachmentKind.exit': 'Exit screenshot',
  'journal.attachmentKind.markup': 'Chart markup',
  'journal.attachmentNote':
    'Attachment metadata only — no image files are stored in this phase, so each preview is a placeholder drawn from the record.',
  'journal.attachmentSlotsAreRecordedAsMetadata':
    'Attachment slots are recorded as metadata only. No file is uploaded or stored in this phase, so nothing here should be read as a stored image.',
  'journal.averageLoss': 'Average loss',
  'journal.averageR': 'Average R',
  'journal.averageRMultiple': 'Average R multiple',
  'journal.averageRewardToRisk': 'Average reward-to-risk',
  'journal.averageRiskPerTrade': 'Average risk per trade',
  'journal.averageWin': 'Average win',
  'journal.averageWinVsAverageLoss': 'Average win vs average loss',
  'journal.awaitingAConnectedProviderNoGenerated':
    'awaiting a connected provider — no generated text is stored',
  'journal.awaitingAReview': 'Awaiting a review',
  'journal.awaitingAReviewScope': 'awaiting a review · scope',
  'journal.before': 'before ·',
  'journal.bestPairOfTheMonthOnProcessNot': 'Best pair of the month on process, not on outcome.',
  'journal.both': 'Both',
  'journal.breakdowns': 'Breakdowns',
  'journal.breakeven': 'breakeven ·',
  'journal.breakoutRetest': 'Breakout retest',
  'journal.broken': 'broken',
  'journal.bucket': 'Bucket',
  'journal.calendarDayState.breakeven': 'Flat day',
  'journal.calendarDayState.flat': 'No trades',
  'journal.calendarDayState.loss': 'Losing day',
  'journal.calendarDayState.mixed': 'Mixed day',
  'journal.calendarDayState.open': 'Open position',
  'journal.calendarDayState.win': 'Winning day',
  'journal.calendarView': 'Calendar view',
  'journal.cancel': 'Cancel',
  'journal.captured': 'captured',
  'journal.chartTimeframe': 'Chart timeframe',
  'journal.checklist': 'checklist',
  'journal.checklistFullyFollowed': 'Checklist fully followed.',
  'journal.chooseARecord': 'Choose a record',
  'journal.clearDay': 'Clear day',
  'journal.close': 'Close',
  'journal.closeActionsMenu': 'Close actions menu',
  'journal.closeColumnOptions': 'Close column options',
  'journal.closed': 'closed',
  'journal.columns': 'Columns',
  'journal.committedRisk': 'committed risk',
  'journal.committedRiskAcross': 'committed risk across',
  'journal.compliance.compliant': 'Compliant',
  'journal.compliance.not-assessed': 'Not assessed',
  'journal.compliance.partial': 'Partial',
  'journal.compliance.violation': 'Rule broken',
  'journal.compliance2.compliant': 'Every rule on the pre-trade checklist was followed.',
  'journal.compliance2.not-assessed': 'The trade has not been reviewed against the checklist yet.',
  'journal.compliance2.partial': 'Some rules were followed; at least one was not.',
  'journal.compliance2.violation':
    'A rule was broken deliberately or the plan was overridden mid-trade.',
  'journal.complianceNotAssessed': 'Compliance not assessed',
  'journal.compliant': 'compliant ·',
  'journal.consecutiveWinsAndLosses': 'Consecutive wins and losses',
  'journal.core': 'core',
  'journal.cumulativeRAfterEachScoredTradeOldestFirst':
    'Cumulative R after each scored trade, oldest first.',
  'journal.cumulativeRPerformance': 'Cumulative R performance',
  'journal.currentRun': 'Current run',
  'journal.curve': 'Curve',
  'journal.customRangeEndDate': 'Custom range end date',
  'journal.customRangeStartDate': 'Custom range start date',
  'journal.defaults': 'Defaults',
  'journal.direction.long': 'Long',
  'journal.direction.short': 'Short',
  'journal.discardThisRecord': 'Discard this record?',
  'journal.distanceBelowTheHighWaterMarkOfTheR':
    'Distance below the high-water mark of the R curve. Zero means a new high.',
  'journal.distributionAndRisk': 'Distribution and risk',
  'journal.drawdown': 'Drawdown',
  'journal.during': 'during ·',
  'journal.emotionalState.anxious': 'Anxious',
  'journal.emotionalState.calm': 'Calm',
  'journal.emotionalState.confident': 'Confident',
  'journal.emotionalState.detached': 'Detached',
  'journal.emotionalState.fearful': 'Fearful',
  'journal.emotionalState.focused': 'Focused',
  'journal.emotionalState.frustrated': 'Frustrated',
  'journal.emotionalState.greedy': 'Greedy',
  'journal.emotionalState.hesitant': 'Hesitant',
  'journal.emotionalState.impulsive': 'Impulsive',
  'journal.enteredBeforeTheLevelWasReached': 'Entered before the level was reached',
  'journal.entryWasSlightlyEarlyAgainstTheChecklist':
    'Entry was slightly early against the checklist',
  'journal.equityCurve': 'Equity curve',
  'journal.eventRiskIsEitherSizedForOrAvoided': 'Event risk is either sized for or avoided.',
  'journal.everyRecordAccountedForIncludingTheTwoThat':
    'Every record accounted for, including the two that are not scored yet.',
  'journal.executionRiskAndManagement': 'Execution, risk and management',
  'journal.exitManagementDrifted': 'Exit management drifted',
  'journal.expectancyOverTime': 'Expectancy over time',
  'journal.export': 'Export',
  'journal.failedBreakout': 'Failed breakout',
  'journal.filteringIsHowAReviewStarts': 'Filtering is how a review starts',
  'journal.flaggedByTheRecordARule':
    'Flagged by the record: a rule break, an unscored trade or a skipped checklist item',
  'journal.flaggedByTheRecordNotBy': 'Flagged by the record, not by the result',
  'journal.forTheAnalyticsSectionAbove': 'for the analytics section above.',
  'journal.fourteenScoredTradesIsASample':
    'Fourteen scored trades is a sample, not a result. Every figure on this page is illustrative.',
  'journal.from': 'From',
  'journal.gapContinuation': 'Gap continuation',
  'journal.grossWin1543RGrossLoss577R': 'Gross win 15.43R ÷ gross loss 5.77R',
  'journal.haveNoMarketContextRecordedAt': 'have no market context recorded at all.',
  'journal.heldPastTheExitPlan': 'Held past the exit plan',
  'journal.heldTheRunnerToThePlannedLevelInstead':
    'Held the runner to the planned level instead of the first reaction.',
  'journal.heldThroughAScheduledEvent': 'Held through a scheduled event',
  'journal.higherTimeframeBiasWrittenBeforeEntry': 'Higher-timeframe bias written before entry',
  'journal.holdingTimeAcrossThe14ScoredTrades': 'Holding time across the 14 scored trades.',
  'journal.illustrativeValues': 'illustrative values',
  'journal.incomplete': 'incomplete ·',
  'journal.interfaceStates': 'Interface states',
  'journal.invalidationLevelWrittenDownBeforeEntry': 'Invalidation level written down before entry',
  'journal.itIsTheTraderRsquoS':
    'It is the trader’s own reading of the day, recorded at the time — useful when compared with the same value on a different day, meaningless as a score.',
  'journal.journalSections': 'Journal sections',
  'journal.labelledSoItIsNeverRead': 'Labelled so it is never read as a measurement',
  'journal.layoutExampleNoModelProviderIs':
    'Layout example. No model provider is connected in this phase, so every field below is empty by construction — this is the shape a review will take, not a review.',
  'journal.lesson': 'Lesson',
  'journal.lessons': 'Lessons',
  'journal.liquiditySweep': 'Liquidity sweep',
  'journal.longestLosingRun': 'Longest losing run',
  'journal.longestWinningRun': 'Longest winning run',
  'journal.losses': 'losses ·',
  'journal.losses2': 'Losses',
  'journal.marked': 'marked',
  'journal.markedAnd': 'marked, and',
  'journal.markedAsARuleBreakOnPurpose': 'Marked as a rule break on purpose.',
  'journal.market.crypto': 'Crypto',
  'journal.market.equities': 'Equities',
  'journal.market.forex': 'Forex',
  'journal.market.futures': 'Futures',
  'journal.marketAnalysis': 'Market analysis',
  'journal.maximumDrawdown': 'Maximum drawdown',
  'journal.measure': 'Measure',
  'journal.methodNote':
    'The journal is a record, not a scoreboard. A rate without its sample size is a rumour, so sample size is shown beside every rate, and an unrecorded trade stays unrecorded.',
  'journal.mistakeFrequency': 'Mistake frequency',
  'journal.mistakes': 'Mistakes',
  'journal.mistakesAndLessons': 'Mistakes and lessons',
  'journal.n10': 'n/10',
  'journal.narrowingToOneSetupOneSession':
    'Narrowing to one setup, one session or one rule state is the point: a journal that can only be read end to end is a diary.',
  'journal.netPerformance': 'Net performance',
  'journal.neverByTheInterfaceAndNever': ', never by the interface and never by the model.',
  'journal.newTradeRecord': 'New trade record',
  'journal.next': 'Next',
  'journal.noAttachmentsOnThisRecord': 'No attachments on this record',
  'journal.noHighImpactEventInsideTheHoldingWindow':
    'No high-impact event inside the holding window',
  'journal.noInvalidationLevelWritten': 'No invalidation level written',
  'journal.noMarketContextWasRecordedFor':
    'No market context was recorded for this trade. It is shown as missing rather than as an empty heading.',
  'journal.noModelWritesANumberHere': 'No model writes a number here',
  'journal.noPsychologyRecordedForThisTrade': 'No psychology recorded for this trade.',
  'journal.noReviewsWrittenYet': 'No reviews written yet',
  'journal.noStoreIsConnectedYet': 'No store is connected yet',
  'journal.noTrades': 'no trades',
  'journal.noWrittenPlanForThisRecord':
    'No written plan for this record. The levels are still shown above; the reasoning behind them was not captured.',
  'journal.none': 'none',
  'journal.notAssessedExcludedFromTheRate':
    'not assessed — excluded from the rate rather than counted as compliant.',
  'journal.notScored': 'not scored',
  'journal.nothingHereIsASignalA':
    'Nothing here is a signal, a recommendation or a rule. A rule change needs an evaluation and a recorded human approval.',
  'journal.nothingIsWaitingForAReview': 'Nothing is waiting for a review',
  'journal.nothingRecordedAsAMistake': 'Nothing recorded as a mistake.',
  'journal.nothingToPlotYet': 'Nothing to plot yet',
  'journal.oneRecordStillHasNoExit': 'One record still has no exit',
  'journal.open': 'open ·',
  'journal.openTheRecord': 'Open the record',
  'journal.packagesTradingEngine': 'packages/trading-engine',
  'journal.partial': 'partial ·',
  'journal.performance': 'Performance',
  'journal.performanceByDirection': 'Performance by direction',
  'journal.performanceBySession': 'Performance by session',
  'journal.performanceBySetup': 'Performance by setup',
  'journal.placeholderNoImageFileStored': 'placeholder · no image file stored',
  'journal.planned': 'Planned',
  'journal.plannedBeforeEntry': 'Planned, before entry',
  'journal.plannedLevelsOf16Records': 'Planned levels of 16 records',
  'journal.plannedNotAchievedRealisedRIsReportedSeparately':
    'Planned, not achieved: realised R is reported separately.',
  'journal.plannedRRAgainstRealisedAverage': 'Planned R:R against realised average R',
  'journal.plannedRewardIsAtLeastTwiceTheRisk': 'Planned reward is at least twice the risk',
  'journal.plannedRiskPerTradeAgainstTheAccountBudget':
    'Planned risk per trade against the account budget. Flat is the goal, not high.',
  'journal.plannedVersusActual': 'Planned versus actual',
  'journal.plannedVersusActualRR': 'Planned versus actual R:R',
  'journal.positionLargerThanTheWrittenRisk': 'Position larger than the written risk',
  'journal.positionSizeMatchesTheWrittenRisk': 'Position size matches the written risk',
  'journal.previewNotice':
    'Interface preview — illustrative journal data. No journal store is connected in this phase, so the trades, screenshots and statistics below are layout examples, not your records and not measured performance.',
  'journal.priceReachesTheEdgeOfADefinedRange':
    'Price reaches the edge of a defined range and rejects it.',
  'journal.profitFactor': 'Profit factor',
  'journal.protectingASmallGainIsAValidDecision':
    'Protecting a small gain is a valid decision, and it is not a loss.',
  'journal.psychology': 'Psychology',
  'journal.queuedAPendingReviewIsThe':
    'Queued. A pending review is the absence of a review, and it is labelled that way rather than shown as an empty result.',
  'journal.r': 'R',
  'journal.rCurveAcross14ScoredTrades': 'R curve across 14 scored trades',
  'journal.rangeReversal': 'Range reversal',
  'journal.readOnly': 'read-only',
  'journal.readingTheseNumbers': 'Reading these numbers',
  'journal.realisedResult': 'Realised result',
  'journal.reclaimInsideTheSameImpulseIsTheConfirmation':
    'Reclaim inside the same impulse is the confirmation.',
  'journal.recordHistory': 'Record history',
  'journal.recordStates': 'Record states',
  'journal.recordedPatternsEachWithItsCorrective':
    'Recorded patterns, each with its corrective note',
  'journal.recordedPatternsWithTheCorrectiveNote': 'Recorded patterns, with the corrective note',
  'journal.recordingChangesNothing': 'Recording changes nothing',
  'journal.recordingIsNotAdopting': 'Recording is not adopting',
  'journal.records': 'records',
  'journal.records2': 'records ·',
  'journal.recordsByChecklistOutcome': 'Records by checklist outcome',
  'journal.recordsByState': 'Records by state',
  'journal.recordsCarryAWrittenReview': 'records carry a written review.',
  'journal.recordsInThePreviewIncludingOne':
    'records in the preview, including one open and one incomplete record on purpose.',
  'journal.reset': 'Reset',
  'journal.result.breakeven': 'Breakeven',
  'journal.result.loss': 'Loss',
  'journal.result.pending': 'Not scored',
  'journal.result.win': 'Win',
  'journal.retryReview': 'Retry review',
  'journal.review': 'Review',
  'journal.reviewAssistance': 'Review assistance',
  'journal.reviewAssistanceExplainsARecordIt':
    'Review assistance explains a record. It never produces the figures, never scores the trade and never changes a rule.',
  'journal.reviewState.not-required': 'Review not required',
  'journal.reviewState.required': 'Review required',
  'journal.reviewState.reviewed': 'Reviewed',
  'journal.reviewStateToPreview': 'Review state to preview',
  'journal.reviewStates': 'Review states',
  'journal.reviewed': 'reviewed ·',
  'journal.reviewsAwaitingYou': 'Reviews awaiting you',
  'journal.riskConsistency': 'Risk consistency',
  'journal.riskConsistencyMattersMoreThanAnySingleResult':
    'Risk consistency matters more than any single result.',
  'journal.riskExceededTheDailyBudget': 'Risk exceeded the daily budget',
  'journal.riskIsNotCalculatedHere': 'Risk is not calculated here',
  'journal.riskIsWithinTheDailyBudget': 'Risk is within the daily budget',
  'journal.rows': 'Rows',
  'journal.rowsAreBucketsOfTheSame':
    'Rows are buckets of the same records, not independent samples — a bucket with a small sample is a hint, not a finding.',
  'journal.rowsPerPage': 'Rows per page',
  'journal.ruleAdherence': 'Rule adherence',
  'journal.ruleCompliance': 'Rule compliance',
  'journal.runningAverageRAsEachNewScoredTrade':
    'Running average R as each new scored trade lands — shown to move, and to be ignored early.',
  'journal.sameAsTheLastPointOnTheEquity': 'Same as the last point on the equity curve',
  'journal.sample': 'Sample',
  'journal.saveDraft': 'Save draft',
  'journal.scope': 'Scope:',
  'journal.scored': 'scored ·',
  'journal.screenshotsAndAttachments': 'Screenshots and attachments',
  'journal.screenshotsForTheseRecordsLiveOn':
    'Screenshots for these records live on each trade; open a record to see them.',
  'journal.searchSymbolReferenceSetupOrTag': 'Search symbol, reference, setup or tag',
  'journal.searchTrades': 'Search trades',
  'journal.selected': 'selected.',
  'journal.selfReportedAndTimestampedTheseAre':
    "Self-reported and timestamped. These are the trader's own reading at the time, not a measurement the system makes.",
  'journal.selfReportedAtTheTime': 'Self-reported at the time',
  'journal.selfReportedEmotionalRead': 'self-reported emotional read',
  'journal.session.asia': 'Asia',
  'journal.session.london': 'London',
  'journal.session.new-york': 'New York',
  'journal.session.overlap': 'London / New York overlap',
  'journal.setupFamily.continuation': 'Continuation',
  'journal.setupFamily.range': 'Range',
  'journal.setupFamily.reversal': 'Reversal',
  'journal.sevenSectionsOpenedOneAtA':
    'Seven sections, opened one at a time. Errors travel with the collapsed header, so a closed section can never hide a problem.',
  'journal.sharesAreOfTheRecordedOccurrences':
    'Shares are of the recorded occurrences, so a quiet week does not look like progress.',
  'journal.sharesAreOfTheRecordedOccurrences2':
    'Shares are of the recorded occurrences. A pattern that repeated is worth more attention than a single large loss.',
  'journal.showAll': 'Show all',
  'journal.sizeIsDerivedFromTheStopDistanceNever':
    'Size is derived from the stop distance, never from conviction.',
  'journal.sizedAboveTheWrittenRisk': 'Sized above the written risk',
  'journal.sortedBy': 'sorted by',
  'journal.source': 'source:',
  'journal.statNote':
    'Every headline figure is an illustrative constant laid out by hand. Real values will come from deterministic journal analytics in the trading engine, never from the model.',
  'journal.statedInAccountCurrency': 'Stated in account currency',
  'journal.status.archived': 'Archived',
  'journal.status.closed': 'Closed',
  'journal.status.incomplete': 'Incomplete',
  'journal.status.open': 'Open',
  'journal.stopMovedAwayFromThePlan': 'Stop moved away from the plan',
  'journal.streaksReadFromTheRecordedSequence': 'Streaks read from the recorded sequence',
  'journal.structuredSummariesOnlyAReviewExplains':
    'Structured summaries only: a review explains the record. It cannot execute a tool, change a rule or place anything.',
  'journal.studyPrompts': 'Study prompts',
  'journal.submitTrade': 'Submit trade',
  'journal.sumOfScoredRNetOfTheCurve': 'Sum of scored R, net of the curve',
  'journal.t': 't',
  'journal.thatRecordCouldNotBeFound': 'That record could not be found',
  'journal.the3UnassessedTradesAreExcludedRatherThan':
    'The 3 unassessed trades are excluded rather than counted as compliant.',
  'journal.theBarIsIndeterminateOnPurpose':
    'The bar is indeterminate on purpose: there is no progress to report until a job reports one.',
  'journal.theChecklistItemThatWasSkippedWasThe':
    'The checklist item that was skipped was the one that would have improved the price.',
  'journal.theDayHasASummaryBut': 'The day has a summary but no openable records in this view.',
  'journal.theDenominatorForEveryOtherFigureOnThis':
    'The denominator for every other figure on this page.',
  'journal.theEmotionalScoreIsSelfReported': 'The emotional score is self-reported',
  'journal.theExitPlanIsPartOfThePlan': 'The exit plan is part of the plan.',
  'journal.theFailedPushIntoTheHighWasThe': 'The failed push into the high was the whole trade.',
  'journal.theFormChecksThatTheLevels':
    'The form checks that the levels agree with the direction. It does not compute your risk, your R multiple or your size — those come from the deterministic engine, and a form that invented them would be the most dangerous component in the application.',
  'journal.theFormRecordsTheLevelsYou':
    'The form records the levels you enter and checks that they agree with the direction. Position size, R multiples and every statistic are produced by the deterministic engine in',
  'journal.theJournalStoresWhatWasDone':
    'The journal stores what was done. Whether the process is worth repeating is a question for the research surface, where a claim needs a sample and an approval.',
  'journal.theLargestSingleLossOnRecordAndThe':
    'The largest single loss on record, and the most instructive.',
  'journal.theLosingTradeWasACleanPlanExecuted':
    'The losing trade was a clean plan executed correctly. It still counts as compliant.',
  'journal.theOneFigureThatSurvivesASmallSample':
    'The one figure that survives a small sample best — and it still needs one.',
  'journal.thePlanIsWhatWasWritten':
    'The plan is what was written before entry; the actual column is what the record shows.',
  'journal.theRangeEdgeIsALocationNotA': 'The range edge is a location, not a signal.',
  'journal.theRatioThatMakesABelow50WinRate':
    'The ratio that makes a below-50% win rate survivable.',
  'journal.theRetestIsTheTradeAnticipatingItIs':
    'The retest is the trade. Anticipating it is a different, worse trade.',
  'journal.theSafetyBoundary': 'The safety boundary',
  'journal.theSameCurveAsEquityReadAsOne':
    'The same curve as equity, read as one number per trade rather than a running total.',
  'journal.theSameSetupProducedALossAndA':
    'The same setup produced a loss and a win on the same day; the process differed, not the setup.',
  'journal.theSetupIsValidForThisTradingSession': 'The setup is valid for this trading session',
  'journal.theSweepWasRealTheEntryWasEarly': 'The sweep was real; the entry was early.',
  'journal.theTradeListCouldNotBe': 'The trade list could not be read',
  'journal.theTypedReasonIsShownInstead':
    'The typed reason is shown instead of a raw provider payload. Retrying is offered only because a provider outage is the kind of failure that can resolve.',
  'journal.theWriteIsNotSubmittingReports': 'The write is not. Submitting reports',
  'journal.thereIsNoRowActionThat':
    'There is no row action that places, changes or closes anything. The application has no such capability and the menu does not imply one.',
  'journal.thisMonth': 'this month.',
  'journal.to': 'To',
  'journal.totalTrades': 'Total trades',
  'journal.tradeCountNetRRiskCompliance':
    'Trade count, net R, risk, compliance, main setup, emotion',
  'journal.tradeDuration': 'Trade duration',
  'journal.tradeEvent.assessment': 'Compliance assessed',
  'journal.tradeEvent.edit': 'Record edited',
  'journal.tradeEvent.entry': 'Entry filled',
  'journal.tradeEvent.exit': 'Position closed',
  'journal.tradeEvent.management': 'Plan adjusted',
  'journal.tradeEvent.recorded': 'Trade recorded',
  'journal.tradeEvent.review': 'Review written',
  'journal.tradeFilters': 'Trade filters',
  'journal.tradeHistory': 'Trade history',
  'journal.tradeIsTakenFromAPreMarkedLevel': 'Trade is taken from a pre-marked level',
  'journal.tradeRange.custom': 'Custom range',
  'journal.tradeRange.last-30': 'Last 30 days',
  'journal.tradeRange.last-90': 'Last 90 days',
  'journal.tradeRange.this-month': 'This month',
  'journal.tradeRange.this-week': 'This week',
  'journal.tradeRange.today': 'Today',
  'journal.tradedTheEdgeWithoutARejection': 'Traded the edge without a rejection',
  'journal.trades': 'trades ·',
  'journal.trading': 'trading',
  'journal.tradingCalendar': 'Trading calendar',
  'journal.tradingJournal': 'Trading Journal',
  'journal.trendPullback': 'Trend pullback',
  'journal.twoPositionsCarriedOverOneWasLeftIncomplete':
    'Two positions carried over; one was left incomplete at the end of the session.',
  'journal.unchanged': 'unchanged',
  'journal.unsavedChanges': 'unsaved changes',
  'journal.unscored': 'unscored',
  'journal.unscoredTheRecordHasNoExit':
    'Unscored: the record has no exit, so there is no realised multiple to show.',
  'journal.validationIsRealTheFormRefuses':
    'Validation is real: the form refuses a record with no symbol, no setup, no invalidation level, or levels that contradict the direction.',
  'journal.viewEditDuplicateArchiveDeleteReview':
    'View, edit, duplicate, archive, delete, review, screenshots.',
  'journal.viewFullscreen': 'View fullscreen',
  'journal.visibleColumns': 'Visible columns',
  'journal.waitingForThePullbackIntoTheZoneGave':
    'Waiting for the pullback into the zone gave a stop that made sense.',
  'journal.whatADayHolds': 'What a day holds',
  'journal.whatHappensWhenYouSubmitIn': 'What happens when you submit in this phase',
  'journal.whatTheAnalyticsDoNotSupport': 'What the analytics do not support',
  'journal.whatTheRecordTaught': 'What the record taught',
  'journal.whatWasPlannedAndWhatWas': 'What was planned, and what was actually done',
  'journal.whereTheNumbersComeFrom': 'Where the numbers come from',
  'journal.wideningTheStopChangesTheRiskSoIt':
    'Widening the stop changes the risk, so it changes the trade.',
  'journal.winLossDistribution': 'Win / loss distribution',
  'journal.winRate': 'Win rate',
  'journal.winRateAndAverageRCan':
    'Win rate and average R can disagree; when they do, expectancy is the figure to look at.',
  'journal.wins': 'wins ·',
  'journal.wins2': 'Wins',
  'journal.worstPeakToTroughOnTheRCurve': 'Worst peak-to-trough on the R curve',
  'journal.writeTheLevelBeforeTheEntryNotAfter':
    'Write the level before the entry, not after the drawdown.',
  'journal.writeUps': 'Write-ups',
  'journal.writingARecordCannotActivateA':
    'Writing a record cannot activate a rule, cannot alter risk limits and cannot reach a broker. It appends history and stops there.',
  'journal.writtenBeforeTheEntryNotAfter': 'Written before the entry, not after',
  // journalCalendar ─────────────────────────────────────────────
  'journalCalendar.clearTheSelectedDay': 'Clear the selected day',
  'journalCalendar.month': 'Month',
  'journalCalendar.week': 'Week',
  // journalPage ─────────────────────────────────────────────────
  'journalPage.aBucketWhoseRealisedResultSitsBelowThe':
    'A bucket whose realised result sits below the planned level is the gap between plan and execution, not a market opinion.',
  'journalPage.aJournalWithRecordsButNoLessonsIs':
    'A journal with records but no lessons is a log. The lessons appear here as they are written.',
  'journalPage.aRuleBreakOrAnUnscoredRecordForces':
    'A rule break or an unscored record forces a review.',
  'journalPage.accountRiskAsPlanned': 'Account risk as planned.',
  'journalPage.addTrade': 'Add trade',
  'journalPage.anEmptyTableAfterFilteringIsASelected':
    'An empty table after filtering is a selected subset that is empty, not an empty journal — and it offers to clear the filters.',
  'journalPage.analytics': 'Analytics',
  'journalPage.calendar': 'Calendar',
  'journalPage.checklist': 'Checklist',
  'journalPage.complianceNote': 'Compliance note',
  'journalPage.everyChartStatesItsScopeAndEveryOne':
    'Every chart states its scope, and every one can be expanded to full screen.',
  'journalPage.everyRecordItsPlanItsRiskWhetherThe':
    'Every record, its plan, its risk, whether the rules held and what it taught. A journal is a record of decisions, not a scoreboard — so sample size travels with every rate, and a missing value stays missing.',
  'journalPage.everyRecordThatRequiredAReviewHasOne':
    'Every record that required a review has one. This state is reachable — it is not an error.',
  'journalPage.exportIsNotConnectedInThisPhaseThe':
    'Export is not connected in this phase: the action reports that rather than producing an empty file.',
  'journalPage.exportTheCurrentJournalView': 'Export the current journal view',
  'journalPage.howTheJournalBehavesBeforeRecordsArriveWhen':
    'How the journal behaves before records arrive, when a filter selects nothing, and when the store cannot be read.',
  'journalPage.improvements': 'Improvements',
  'journalPage.management': 'Management',
  'journalPage.noMistakesRecorded': 'no mistakes recorded',
  'journalPage.noRecordsMatchTheseFilters': 'No records match these filters',
  'journalPage.nothingRecordedAsAMistake': 'nothing recorded as a mistake',
  'journalPage.oneLinePerReviewedRecordTheWhole':
    'One line per reviewed record — the whole reason the journal exists.',
  'journalPage.openTheAddTradeForm': 'Open the add trade form',
  'journalPage.plannedEntry': 'planned entry',
  'journalPage.plannedRewardToRiskIsTheDashedReferenceTheBars':
    'Planned reward-to-risk is the dashed reference; the bars are what the records realised, per setup.',
  'journalPage.readingTheJournal': 'Reading the journal',
  'journalPage.realisedAverageR': 'Realised average R',
  'journalPage.realisedR': 'Realised R',
  'journalPage.recordedEntryExit': 'Recorded entry → exit',
  'journalPage.records': 'Records',
  'journalPage.reviewState': 'Review state',
  'journalPage.reviewsAndLessons': 'Reviews and lessons',
  'journalPage.riskCommitted': 'Risk committed',
  'journalPage.theComparisonTheJournalExistsForWhatWas':
    'The comparison the journal exists for: what was intended against what happened.',
  'journalPage.theFailureReportsItsTypedReasonAFailed':
    'The failure reports its typed reason. A failed read is never rendered as an empty journal.',
  'journalPage.theJournalStoreAndItsExportPipelineArrive':
    'The journal store and its export pipeline arrive with the API integration. Nothing was written, and no file was created.',
  'journalPage.theJournalStoreCouldNotBeRead': 'The journal store could not be read',
  'journalPage.theKeyZoneMarketStructureAndLiquidityContext':
    'The key zone, market structure and liquidity context are text in the record, so they are shown as text below rather than drawn as lines the data cannot support.',
  'journalPage.thePlaceholderMatchesTheTableItIsStanding':
    'The placeholder matches the table it is standing in for, so the layout does not jump when records arrive.',
  'journalPage.theReferenceDoesNotMatchARecordIn':
    'The reference does not match a record in the journal view. Nothing was changed.',
  'journalPage.thesis': 'Thesis',
  'journalPage.tradeDetails': 'Trade details',
  'journalPage.twoPointsOnlyTheRecordedEntryAndThe':
    'Two points only: the recorded entry and the recorded exit. No intermediate price path is invented.',
  'journalPage.unscoredRecordsShowAGapNotAZero': 'Unscored records show a gap, not a zero.',
  'journalPage.volatility': 'Volatility',
  'journalPage.wentWell': 'Went well',
  'journalPage.whatTheJournalIsForAndWhatIt':
    'What the journal is for, and what it refuses to pretend',
  'journalPage.writtenBeforeEntry': 'Written before entry.',
  // journalTrades ───────────────────────────────────────────────
  'journalTrades.aBoundaryTestedRepeatedlyIsThinnerThanIt':
    'A boundary tested repeatedly is thinner than it looks.',
  'journalTrades.aCentralBankSpeakerAfterTheHoldingWindow':
    'A central-bank speaker after the holding window.',
  'journalTrades.aCloseAbove21310InvalidatesTheRangeRead':
    'A close above 21310 invalidates the range read.',
  'journalTrades.aCloseBackInside58405844WithoutARejection':
    'A close back inside 5840–5844 without a rejection voids the setup.',
  'journalTrades.aCloseBelow5800ShouldHaveEndedThe':
    'A close below 5800 should have ended the trade.',
  'journalTrades.aFifteenMinuteCloseAbove19005': 'A fifteen-minute close above 190.05.',
  'journalTrades.aFifteenMinuteCloseBackBelowTheSweepLow':
    'A fifteen-minute close back below the sweep low.',
  'journalTrades.aFifteenMinuteCloseBelow11060': 'A fifteen-minute close below 1.1060.',
  'journalTrades.aFifteenMinuteCloseBelowTheSweepLow':
    'A fifteen-minute close below the sweep low.',
  'journalTrades.aLevelThatProducedTwoFailedPushesIs':
    'A level that produced two failed pushes is more likely to hold on the third attempt after it breaks and is retested.',
  'journalTrades.aLosingTradeThatFollowedEveryRuleCompliance':
    'A losing trade that followed every rule. Compliance is not outcome.',
  'journalTrades.aMidSessionReleaseWasIgnored': 'A mid-session release was ignored.',
  'journalTrades.aOneHourCloseBelow62900': 'A one-hour close below 62900.',
  'journalTrades.aSetup': 'A+ setup',
  'journalTrades.aTrendThatPullsIntoAPriorBreakout':
    'A trend that pulls into a prior breakout shelf offers a defined risk against the trend.',
  'journalTrades.aboveAverage': 'Above average.',
  'journalTrades.aboveAverageTheDayRangeWas14The':
    'Above average; the day range was 1.4× the twenty-day mean.',
  'journalTrades.allEightChecklistItemsWereSatisfiedBeforeEntry':
    'All eight checklist items were satisfied before entry.',
  'journalTrades.asiaSession': 'asia session',
  'journalTrades.asianHighSwept': 'Asian high swept',
  'journalTrades.average': 'Average.',
  'journalTrades.bearishRejectionFromTheShelfButEnteredBefore':
    'Bearish rejection from the shelf, but entered before the confirming close.',
  'journalTrades.beingEarlyIsNotTheSameAsBeing':
    'Being early is not the same as being right, even when it works.',
  'journalTrades.belowAverageTheRangeWasNarrow': 'Below average; the range was narrow.',
  'journalTrades.bestExecutionOnRecordForThisSetup': 'Best execution on record for this setup.',
  'journalTrades.bullishEngulfingCloseBackAboveTheShelf':
    'Bullish engulfing close back above the shelf.',
  'journalTrades.buySideLiquidityAboveTheAsianSessionHighWas':
    'Buy-side liquidity above the Asian session high was taken first.',
  'journalTrades.checklistCompleteTheExitCameInSlightlyUnder':
    'Checklist complete; the exit came in slightly under the plan target.',
  'journalTrades.checklistCompleteTheRunnerWasAllowedPastThe':
    'Checklist complete; the runner was allowed past the plan target.',
  'journalTrades.cleanHigherLowsOnTheFifteenMinuteChart':
    'Clean higher lows on the fifteen-minute chart.',
  'journalTrades.cleanLoss': 'clean loss',
  'journalTrades.countHowManyTimesALevelWasTested':
    'Count how many times a level was tested before fading it.',
  'journalTrades.counterTrendRalliesIntoAPriorHighOfferA':
    'Counter-trend rallies into a prior high offer a defined stop above the shelf.',
  'journalTrades.dailyAboveThePriorWeekHighBiasLong':
    'Daily above the prior week high; bias long above 5800.',
  'journalTrades.dailyBias': 'Daily bias',
  'journalTrades.dailyBullishButTheOverlapSessionWasChoppy':
    'Daily bullish, but the overlap session was choppy.',
  'journalTrades.dailyDowntrend': 'Daily downtrend',
  'journalTrades.dailyDowntrendRalliesSoldIntoThePriorDay':
    'Daily downtrend; rallies sold into the prior day high.',
  'journalTrades.dailyTrend': 'Daily trend',
  'journalTrades.dailyUptrendButTheFourHourChartWasRolling':
    'Daily uptrend, but the four-hour chart was rolling over.',
  'journalTrades.dailyUptrendPriceAboveThePriorWeekClose':
    'Daily uptrend, price above the prior week close.',
  'journalTrades.earlyEntry': 'early entry',
  'journalTrades.elevatedIntoTheOverlap': 'Elevated into the overlap.',
  'journalTrades.enteredBeforeTheRejectionClose': 'Entered before the rejection close',
  'journalTrades.enteredOnApproachWithoutARejection': 'Entered on approach without a rejection',
  'journalTrades.entryCameFromTheShelfNotFromThe': 'Entry came from the shelf, not from the open.',
  'journalTrades.entryOnTheHigherLowAfterTheReclaim':
    'Entry on the higher low after the reclaim, with the stop under the sweep low.',
  'journalTrades.entryTakenOnApproachRatherThanOnA':
    'Entry taken on approach rather than on a rejection.',
  'journalTrades.entryTakenOnTheFirstLowerCloseAfter':
    'Entry taken on the first lower close after the rejection wick.',
  'journalTrades.entryWasTakenOnTheSweepItselfRather':
    'Entry was taken on the sweep itself rather than on the reclaim.',
  'journalTrades.entryWasTakenOneCandleBeforeTheRejection':
    'Entry was taken one candle before the rejection close.',
  'journalTrades.equalHighsAt5858TakenBeforeTheRetest':
    'Equal highs at 5858 taken before the retest.',
  'journalTrades.executionRecord': 'execution record',
  'journalTrades.exitAt25ROrOnInvalidation': 'Exit at 2.5R or on invalidation.',
  'journalTrades.failedPush': 'failed push',
  'journalTrades.failedToMakeAHigherHighAfterThe':
    'Failed to make a higher high after the London close.',
  'journalTrades.flatClose': 'flat close',
  'journalTrades.fourHourTrend': 'Four-hour trend',
  'journalTrades.fourHourUptrendIntactAbove11050': 'Four-hour uptrend intact above 1.1050.',
  'journalTrades.fullExitAt25R': 'Full exit at 2.5R.',
  'journalTrades.fullExitAt25ROrOnTheFirst':
    'Full exit at 2.5R or on the first fifteen-minute close below the rising shelf.',
  'journalTrades.fullExitAt25ROrOnTheFirst2': 'Full exit at 2.5R or on the first higher low.',
  'journalTrades.halfOffAt15RStopToBreakevenAfter': 'Half off at 1.5R, stop to breakeven after.',
  'journalTrades.halfWasTrimmedAt15RAsPlanned': 'Half was trimmed at 1.5R as planned.',
  'journalTrades.hardStopThePlatformAtTheDailyRiskLimit':
    'Hard-stop the platform at the daily risk limit.',
  'journalTrades.heldTheRunnerToThePlannedLevelRather':
    'Held the runner to the planned level rather than the first reaction.',
  'journalTrades.highExpandingAfterTheSweep': 'High, expanding after the sweep.',
  'journalTrades.highThePairWasMovingOnARate':
    'High; the pair was moving on a rate decision later in the week.',
  'journalTrades.higherHighsAndHigherLowsThroughTheEuropean':
    'Higher highs and higher lows through the European session.',
  'journalTrades.higherLowsOnTheFourHourChart': 'Higher lows on the four-hour chart.',
  'journalTrades.ignoredAScheduledRelease': 'Ignored a scheduled release',
  'journalTrades.keepTheSweepAndReclaimRequirementForEverySessionLowE':
    'Keep the sweep-and-reclaim requirement for every session-low entry.',
  'journalTrades.keepTheTwoStepEntryRuleForEveryBreakoutRetest':
    'Keep the two-step entry rule for every breakout-retest in this session.',
  'journalTrades.levelRetestedTwice': 'Level retested twice',
  'journalTrades.logTheTrimDecisionAtTheTimeRather':
    'Log the trim decision at the time rather than at the close.',
  'journalTrades.londonSession': 'London session',
  'journalTrades.low': 'Low.',
  'journalTrades.lowerHighsAndLowerLowsAcrossTheLondon':
    'Lower highs and lower lows across the London session.',
  'journalTrades.lowerHighsIntoTheLondonOpen': 'Lower highs into the London open.',
  'journalTrades.lowerHighsIntoTheRangeLow': 'Lower highs into the range low.',
  'journalTrades.lowerTimeframeHigherLowInsideTheZoneThenA':
    'Lower-timeframe higher low inside the zone, then a close back above it.',
  'journalTrades.managedExit': 'managed exit',
  'journalTrades.moveTheStopToBreakevenOnlyAfter1R':
    'Move the stop to breakeven only after 1R, never before.',
  'journalTrades.movedTheStopAwayFromThePlan': 'Moved the stop away from the plan',
  'journalTrades.needsExit': 'needs exit',
  'journalTrades.neutralPriceInsideAThreeDayRange': 'Neutral: price inside a three-day range.',
  'journalTrades.neutralPriceInsideThePriorDayRange': 'Neutral: price inside the prior day range.',
  'journalTrades.noAdjustmentPlannedTheStopWasTheThesis':
    'No adjustment planned; the stop was the thesis.',
  'journalTrades.noEntryWithoutTheConfirmationCandleRegardlessOf':
    'No entry without the confirmation candle, regardless of how the level looks.',
  'journalTrades.noReclaim': 'no reclaim',
  'journalTrades.noReleaseDuringTheHoldingWindowButElevated':
    'No release during the holding window, but elevated event risk in the week.',
  'journalTrades.noReleaseInsideTheWindow': 'No release inside the window.',
  'journalTrades.noReleaseUntilTheAfternoon': 'No release until the afternoon.',
  'journalTrades.noScheduledReleaseInsideTheHoldingWindow':
    'No scheduled release inside the holding window.',
  'journalTrades.noneRecordedBeforeEntryTheLevelWas':
    'None recorded before entry — the level was assumed to hold.',
  'journalTrades.noneScheduled': 'None scheduled.',
  'journalTrades.notCheckedBeforeEntry': 'Not checked before entry.',
  'journalTrades.notWrittenBeforeEntry': 'Not written before entry.',
  'journalTrades.noteThatTheBoundaryHadBeenTestedThree':
    'Note that the boundary had been tested three times, which weakens a fade.',
  'journalTrades.overnightHigh': 'Overnight high',
  'journalTrades.plannedStopToBreakevenAt1RActualThe':
    'Planned: stop to breakeven at 1R. Actual: the stop was widened twice.',
  'journalTrades.positionOpen': 'position open',
  'journalTrades.priorDayLow': 'Prior day low',
  'journalTrades.pullbackIntoDemand': 'pullback into demand',
  'journalTrades.rangeBoundary': 'Range boundary',
  'journalTrades.rangeEdge': 'range edge',
  'journalTrades.rangeHigh': 'range high',
  'journalTrades.rangeLow': 'Range low',
  'journalTrades.rangeLowSatDirectlyBeneathAVisibleSupport':
    'Range low sat directly beneath a visible support line.',
  'journalTrades.rangeMid': 'Range mid.',
  'journalTrades.rangeWithAClearUpperBoundaryAt21310':
    'Range with a clear upper boundary at 21310.',
  'journalTrades.reclaimOfThePriorDayLowWithinThe':
    'Reclaim of the prior day low within the same impulse, then a higher low.',
  'journalTrades.recordIncomplete': 'record incomplete',
  'journalTrades.recordTheTrailingRuleThatWasActuallyUsed':
    'Record the trailing rule that was actually used, not the planned one.',
  'journalTrades.recordedAsPartialComplianceEvenThoughTheTrade':
    'Recorded as partial compliance even though the trade was profitable.',
  'journalTrades.rejectionWickIntoTheBoundaryThenALower':
    'Rejection wick into the boundary, then a lower close.',
  'journalTrades.requireARejectionCloseBeforeAnyRangeEdgeEntry':
    'Require a rejection close before any range-edge entry.',
  'journalTrades.retestHeldForTwoCandlesWhichWasTreated':
    'Retest held for two candles, which was treated as confirmation.',
  'journalTrades.riskedPastTheDailyBudget': 'Risked past the daily budget',
  'journalTrades.ruleBreak': 'rule break',
  'journalTrades.runnerHeld': 'runner held',
  'journalTrades.sellSideLiquidityBelowTheLondonOpenLowWas':
    'Sell-side liquidity below the London open low was swept first.',
  'journalTrades.sellSideStopsBelowTheLondonOpenLowWere':
    'Sell-side stops below the London open low were taken in one impulse.',
  'journalTrades.sessionOpen': 'session open',
  'journalTrades.setTheRunnerExitAtTheLevelNot': 'Set the runner exit at the level, not on feel.',
  'journalTrades.shelf': 'Shelf',
  'journalTrades.shelfRetest': 'Shelf retest',
  'journalTrades.sizingRespectedTheWrittenRiskDespiteTheEarly':
    'Sizing respected the written risk despite the early entry.',
  'journalTrades.skippedTheInvalidationChecklistItem': 'Skipped the invalidation checklist item',
  'journalTrades.stopMoved': 'stop moved',
  'journalTrades.stopToBreakevenAt1R': 'Stop to breakeven at 1R.',
  'journalTrades.stopToBreakevenAt1RTrailUnderEach':
    'Stop to breakeven at 1R, trail under each fifteen-minute higher low after 2R.',
  'journalTrades.stoppedOut': 'stopped out',
  'journalTrades.stopsRestingAboveTheOvernightHighAt21290':
    'Stops resting above the overnight high at 21290.',
  'journalTrades.stopsTakenBelowThePriorDayLow': 'Stops taken below the prior day low.',
  'journalTrades.stopsWereClusteredJustBelowTheRetestLow':
    'Stops were clustered just below the retest low.',
  'journalTrades.sweepOfTheSessionLow': 'Sweep of the session low',
  'journalTrades.targetTheRangeMidThenReassess': 'Target the range mid, then reassess.',
  'journalTrades.theBreakoutShelfWouldHoldAndContinueWith':
    'The breakout shelf would hold and continue with the daily trend.',
  'journalTrades.theInvalidationCloseHappenedAndTheStopWas':
    'The invalidation close happened and the stop was widened instead of honoured, which pushed the loss to 1.6R and past the daily risk budget.',
  'journalTrades.theLevelIsALocationWithoutARejection':
    'The level is a location. Without a rejection it is only a hope.',
  'journalTrades.theLossStayedInsideBudget': 'The loss stayed inside budget.',
  'journalTrades.theMostInstructiveRecordInTheJournalAnd':
    'The most instructive record in the journal, and the worst one.',
  'journalTrades.thePriorDayLowWouldBeSweptAnd':
    'The prior day low would be swept and reclaimed as it had been twice that week.',
  'journalTrades.thePushIntoTheOvernightHighWouldFail':
    'The push into the overnight high would fail and return to the range mid.',
  'journalTrades.theRangeLowWouldHoldForAThird': 'The range low would hold for a third time.',
  'journalTrades.theRetestHeldWithAHigherLowSo':
    'The retest held with a higher low, so the stop could sit under the zone.',
  'journalTrades.theRetestIsTheTradeTheBreakIs':
    'The retest is the trade. The break is only the condition.',
  'journalTrades.theRewardItemAndTheConfirmationRequirementWere':
    'The reward item and the confirmation requirement were both skipped: entry was taken before the rejection close.',
  'journalTrades.theRunnerWasClosedALittleEarlyAgainst':
    'The runner was closed a little early against the plan.',
  'journalTrades.theRunnerWasManagedByRule': 'The runner was managed by rule.',
  'journalTrades.theStopSatUnderTheShelfWhichIs':
    'The stop sat under the shelf, which is where the pullback would be wrong.',
  'journalTrades.theStopWasHonouredExactlyAsPlanned': 'The stop was honoured exactly as planned.',
  'journalTrades.theStopWasNotTouchedWidenedOrCancelled':
    'The stop was not touched, widened or cancelled.',
  'journalTrades.theSweepSuppliesTheFuelTheReclaimIs':
    'The sweep supplies the fuel; the reclaim is the signal.',
  'journalTrades.theTradeWasReviewedTheSameDayAnd':
    'The trade was reviewed the same day and marked as a rule break.',
  'journalTrades.threeChecklistItemsWereSkippedNoWrittenInvalidation':
    'Three checklist items were skipped: no written invalidation, size above the written risk, and no rejection before entry.',
  'journalTrades.treatedTheSweepAsConfirmationNoReclaimPrinted':
    'Treated the sweep as confirmation; no reclaim printed.',
  'journalTrades.trendDay': 'trend day',
  'journalTrades.trimAt25RTrailTheRemainder': 'Trim at 2.5R, trail the remainder.',
  'journalTrades.trimHalfAt2RTrailTheRemainderUnder':
    'Trim half at 2R, trail the remainder under each 5m higher low.',
  'journalTrades.trimmingIsAPlanClosingTheRestIs':
    'Trimming is a plan; closing the rest is a second, separate decision.',
  'journalTrades.twoChecklistItemsAreUnrecordedSoComplianceCannot':
    'Two checklist items are unrecorded, so compliance cannot be assessed either way — an honest unassessed is reported as unassessed.',
  'journalTrades.volumeExpansionOnTheBreak': 'Volume expansion on the break',
  'journalTrades.waitForTheConfirmingCloseEvenWhenThe':
    'Wait for the confirming close even when the level looks obvious.',
  'journalTrades.waitedForTheReclaimRatherThanTheSweep':
    'Waited for the reclaim rather than the sweep itself.',
  'journalTrades.waitedForTheRetestInsteadOfTheBreak':
    'Waited for the retest instead of the break.',
  'journalTrades.weakTheRetestHeldForTwoCandlesOnly': 'Weak: the retest held for two candles only.',
  'journalTrades.weeklyOpen': 'Weekly open',
  'journalTrades.whenASessionLowIsSweptAndReclaimed':
    'When a session low is swept and reclaimed inside one impulse, the stops that were taken supply the move.',
  'journalTrades.whenTheInvalidationClosePrintsTheTradeIs':
    'When the invalidation close prints, the trade is over — no exceptions.',
  'journalTrades.wideningAStopIsANewTradeWith':
    'Widening a stop is a new trade with a bigger size and no thesis.',
  'journalTrades.writeTheInvalidationBeforeLookingAtSize':
    'Write the invalidation before looking at size.',
  // knowledgeSearch ─────────────────────────────────────────────
  'knowledgeSearch.clearSearch': 'Clear search',
  // lab ─────────────────────────────────────────────────────────
  'lab.activationRefusedWithoutANonExpired':
    'Activation: refused without a non-expired approval row referencing this proposal.',
  'lab.awaitingApproval': 'awaiting approval',
  'lab.calculatePositionSize': 'Calculate position size',
  'lab.deterministicEvaluationSampleSizeExpectancyAnd':
    'Deterministic evaluation: sample size, expectancy and an explicit',
  'lab.deterministicToolInputTheModelNever':
    'Deterministic tool input — the model never performs this arithmetic',
  'lab.humanDecisionOnlyAnOwnerMay':
    'Human decision: only an owner may decide, and the requester cannot approve their own proposal.',
  'lab.inconclusive': 'inconclusive',
  'lab.noResultYet': 'No result yet',
  'lab.positionSizeCalculator': 'Position size calculator',
  'lab.practiceChart': 'Practice chart',
  'lab.proposalsAreDraftsUntilAnEvaluation':
    'Proposals are drafts until an evaluation and a human approval exist',
  'lab.proposedProcessRule': 'Proposed process rule',
  'lab.reject': 'Reject',
  'lab.requestApproval': 'Request approval',
  'lab.ruleText': 'Rule text',
  'lab.skipAnySetupWhereTheInvalidation':
    '“Skip any setup where the invalidation level cannot be written before entry.”',
  'lab.statesAroundAToolCall': 'States around a tool call',
  'lab.statusDraftEvaluationAttachedAwaitingHuman':
    'Status: draft → evaluation attached → awaiting human activation',
  'lab.syntheticSeriesForLayoutReview': '· synthetic series for layout review',
  'lab.toolResult': 'Tool result',
  'lab.tradingLab': 'Trading lab',
  'lab.tradingLabSections': 'Trading lab sections',
  'lab.verdictWhenTheEvidenceIsThin': 'verdict when the evidence is thin.',
  'lab.whereAToolResultWillAppear': 'Where a tool result will appear, with provenance',
  // labels ──────────────────────────────────────────────────────
  'labels.heldForReview': 'Held for review',
  'labels.notADeclaredCapability': 'Not a declared capability',
  'labels.notBuiltYet': 'Not built yet',
  'labels.notIncludedInYourPlan': 'Not included in your plan',
  'labels.periodAllowanceUsed': 'Period allowance used',
  'labels.planNotRecognised': 'Plan not recognised',
  'labels.subscriptionNotActive': 'Subscription not active',
  // memory ──────────────────────────────────────────────────────
  'memory.aPromotionToVerifiedOrAuthoritative':
    'A promotion to verified or authoritative names the human or tool that granted it. The model is never accepted as a verifier.',
  'memory.aTenTradeSampleCannotDistinguishSkillFromNoise':
    'A ten-trade sample cannot distinguish skill from noise',
  'memory.abandonedExperiment': 'Abandoned experiment',
  'memory.abandonedExperimentNoteTheClaimCameFromA':
    'Abandoned experiment note: the claim came from a sample of eleven trades, which is too small to support it. Kept archived so it is not re-derived.',
  'memory.academyLesson13': 'Academy lesson 1.3',
  'memory.academyLesson22': 'Academy lesson 2.2',
  'memory.academyLesson23': 'Academy lesson 2.3',
  'memory.academyRubric51': 'Academy rubric 5.1',
  'memory.agentAskedForAHumanCheckItCannot':
    'Agent asked for a human check; it cannot promote the record itself.',
  'memory.agentConversation': 'Agent conversation',
  'memory.agentLearnings': 'Agent Learnings',
  'memory.anOlderExplanationOfRuleActivationWasReturned':
    'An older explanation of rule activation was returned after the workflow changed. Tombstoned rather than edited, so the mistake stays visible.',
  'memory.appendOnly': 'Append-only',
  'memory.apr': 'Apr',
  'memory.archivedRecords': 'Archived records',
  'memory.archivedTombstonedNeverDeletedTheHistoryIsKept':
    'Archived: tombstoned, never deleted; the history is kept as evidence.',
  'memory.archivedWithTheReasonNotDeleted': 'Archived with the reason, not deleted.',
  'memory.aug': 'Aug',
  'memory.awaitingReviewNoEvaluationRecordWasCited':
    'Awaiting review: no evaluation record was cited.',
  'memory.capturedFromTheJournalEntry': 'Captured from the journal entry.',
  'memory.categories': 'Categories',
  'memory.confidenceIsAPropertyOfThe':
    'Confidence is a property of the source, not a probability about markets.',
  'memory.confirmedAsAuthoritativeAfterReviewTheClaimIs':
    'Confirmed as authoritative after review: the claim is a statement about inference, not about markets, and it constrains how every other finding may be read.',
  'memory.contextKindForTrust': 'contextKindForTrust()',
  'memory.created': 'created',
  'memory.curriculumDocument': 'Curriculum document',
  'memory.deletionIsATombstone': 'Deletion is a tombstone',
  'memory.deterministicRTool': 'Deterministic R tool',
  'memory.deterministicSizingTool': 'Deterministic sizing tool',
  'memory.deterministicToolOutputReCheckedByTheUserAgainst':
    'Deterministic tool output, re-checked by the user against the lesson worked example.',
  'memory.errorsThisUserActuallyMadeWithTheLesson':
    'Errors this user actually made, with the lesson they point back to',
  'memory.events': 'events',
  'memory.exampleRecordsInThisState': 'example records in this state.',
  'memory.expressingAnOutcomeInRiskUnitsRemovesPosition':
    'Expressing an outcome in risk units removes position size from the comparison, which is what lets a review across instruments mean anything.',
  'memory.filterBySource': 'Filter by source',
  'memory.filtersAreIndependentTrustAndSource':
    'Filters are independent: trust and source are separate questions about a record.',
  'memory.findingsFromExperimentsAlwaysWithASampleSize':
    'Findings from experiments, always with a sample size',
  'memory.fixedFractionalSizingBoundsRuinRiskBeforeItBounds':
    'Fixed-fractional sizing bounds ruin risk before it bounds return',
  'memory.humanNoteOrVerification': 'Human note or verification',
  'memory.humanVerification': 'Human verification',
  'memory.illustrative': 'illustrative',
  'memory.illustrativeSampleOfNineRecords': 'Illustrative sample of nine records',
  'memory.inTheSample': 'in the sample',
  'memory.journalEntry': 'Journal entry',
  'memory.journalEntryMissingAnExplicitInvalidationLevel':
    'Journal entry missing an explicit invalidation level',
  'memory.jul': 'Jul',
  'memory.jun': 'Jun',
  'memory.kind.document': 'Document',
  'memory.kind.human': 'Human',
  'memory.kind.market-data': 'Market data',
  'memory.kind.model': 'Model-authored',
  'memory.kind.synthetic': 'Synthetic',
  'memory.kind.tool': 'Deterministic tool',
  'memory.knowledgeBase': 'Knowledge base',
  'memory.knowledgeGrowth': 'Knowledge growth',
  'memory.knowledgeMemory': 'Knowledge memory',
  'memory.marketRules': 'Market Rules',
  'memory.may': 'May',
  'memory.mechanicsAndDefinitionsTheCurriculumTeaches':
    'Mechanics and definitions the curriculum teaches',
  'memory.memorySections': 'Memory sections',
  'memory.memoryStatus.archived': 'Archived',
  'memory.memoryStatus.pending-review': 'Pending review',
  'memory.memoryStatus.unverified': 'Unverified',
  'memory.memoryStatus.verified': 'Verified',
  'memory.memoryStatus2.archived':
    'Tombstoned. Kept as evidence: history is never silently removed.',
  'memory.memoryStatus2.pending-review':
    'Written, sourced, and waiting for a non-model verifier to check it.',
  'memory.memoryStatus2.unverified':
    'Not yet checked. It may be retrieved, but it is never presented as fact.',
  'memory.memoryStatus2.verified':
    'A human or a deterministic tool checked this against its source.',
  'memory.modelAuthoredOnlyAHumanOrAToolMay':
    'Model-authored; only a human or a tool may raise its trust.',
  'memory.noHistoryRecorded': 'No history recorded',
  'memory.noKnowledgeRecorded': 'No knowledge recorded',
  'memory.noRecordsMatchThisFilter': 'No records match this filter',
  'memory.noSourceRecordedAnUnsourcedClaim':
    'No source recorded — an unsourced claim may be retrieved but never presented as fact.',
  'memory.notAConnectedKnowledgeBase': 'Not a connected knowledge base',
  'memory.ofTheRecordsInTheIllustrative': 'Of the records in the illustrative sample',
  'memory.openRecord': 'Open record',
  'memory.orderingCorrectedToBudgetStopSize': 'Ordering corrected to budget → stop → size.',
  'memory.pendingReview': 'pending review',
  'memory.personalMistakes': 'Personal Mistakes',
  'memory.previewFilterSubstringMatchingOnlySemantic':
    'Preview filter: substring matching only. Semantic retrieval (embeddings, ranking, trust-filtered recall) is implemented in the backend but is not connected here.',
  'memory.previewNotice':
    'Illustrative knowledge base. Retrieval, embeddings and persistence are implemented in the backend but are not connected to this preview: nothing here was retrieved or ranked.',
  'memory.promotedToAuthoritativeByAHumanVerifier':
    'Promoted to authoritative by a human verifier.',
  'memory.proposedARuleChangeWithoutCitingAnEvaluation':
    'Proposed a rule change without citing an evaluation',
  'memory.provenanceRecorded': 'Provenance recorded',
  'memory.rMultiplesMakeTwoDifferentSymbolsComparable':
    'R-multiples make two different symbols comparable',
  'memory.recentKnowledge': 'Recent knowledge',
  'memory.recordConfidence': 'Record confidence',
  'memory.recordedFromThreeConsecutiveSizingAttemptsRoundingUp':
    'Recorded from three consecutive sizing attempts. Rounding up exceeds the stated budget, so the stated risk becomes a wish rather than a limit.',
  'memory.recordsAcrossFiveCategories': 'Records across five categories',
  'memory.recordsPerMonthByTrustSix': 'Records per month by trust, six months of study',
  'memory.removingKnowledgeMarksItArchivedAnd':
    'Removing knowledge marks it archived and keeps the history, so a claim that was once trusted remains auditable.',
  'memory.researchNotes': 'Research Notes',
  'memory.resetFilters': 'Reset filters',
  'memory.retrievalSurfacedASupersededExplanation': 'Retrieval surfaced a superseded explanation',
  'memory.retrievedButNotTrusted': 'Retrieved but not trusted',
  'memory.rewordedToSeparateSmallSampleFromNoEdge':
    'Reworded to separate "small sample" from "no edge".',
  'memory.riskPerUnitComesFromTheStopDistance':
    'Risk per unit comes from the stop distance, so the size follows from the budget. The order matters: budget, stop, size — never size first.',
  'memory.roundingTheUnitCountUpInsteadOfDown': 'Rounding the unit count up instead of down',
  'memory.searchByTitleTagSourceReference': 'Search by title, tag, source reference',
  'memory.searchKnowledgeRecords': 'Search knowledge records',
  'memory.searchTheKnowledgeBase': 'Search the knowledge base',
  'memory.sep': 'Sep',
  'memory.sessionCostAndMicrostructureConstraints': 'Session, cost and microstructure constraints',
  'memory.sessionOverlapChangesTheRealisedSpread': 'Session overlap changes the realised spread',
  'memory.statedDrawdownToleranceDidNotMatchBehaviour':
    'Stated drawdown tolerance did not match behaviour',
  'memory.supersededExplanationArchivedTheEntryStaysAsEvidence':
    'Superseded explanation archived; the entry stays as evidence.',
  'memory.syntheticData': 'Synthetic data',
  'memory.syntheticNotRealMarketData': 'synthetic — not real market data',
  'memory.syntheticSeries': 'Synthetic series',
  'memory.theAgentSuggestedTighteningTheSessionFilterAnd':
    'The agent suggested tightening the session filter and referenced no evaluation record. It is kept unverified and cannot become trusted knowledge on its own.',
  'memory.theCostOfEnteringDuringTheOverlapDiffers':
    'The cost of entering during the overlap differs from the thin session either side of it, so a simulated fill must carry the session it was taken in.',
  'memory.theRestIsUnverifiedOrAwaiting':
    'The rest is unverified or awaiting a non-model verifier. Nothing is promoted by usage.',
  'memory.theUserWroteItNoVerifierHasChecked':
    'The user wrote it; no verifier has checked the pattern yet.',
  'memory.theWrittenReviewDescribedTheSetupButNot':
    'The written review described the setup but not the level that would have made it wrong, so the trade could not be reviewed honestly afterwards.',
  'memory.tombstonedRetainedAsEvidence': 'Tombstoned, retained as evidence',
  'memory.toolOutput': 'Tool output',
  'memory.tradingConcepts': 'Trading Concepts',
  'memory.trustMix': 'Trust mix',
  'memory.trustPolicy': 'Trust policy',
  'memory.trustStates': 'Trust states',
  'memory.unverified': 'unverified',
  'memory.unverifiedWarning': 'Unverified warning',
  'memory.updated': 'updated',
  'memory.v': '· v',
  'memory.verificationIsRecorded': 'Verification is recorded',
  'memory.verified': 'verified',
  'memory.verifiedByAHumanReviewerOnlyAHuman':
    'Verified by a human reviewer; only a human may grant authoritative trust.',
  'memory.verifiedRecordsAtTheEndOf': 'verified records at the end of the series',
  'memory.verifiedShare': 'Verified share',
  'memory.whatKeepsTheKnowledgeBaseHonest': 'What keeps the knowledge base honest',
  'memory.whatTheAgentConcludedUnverifiedUntilA':
    'What the agent concluded — unverified until a human or tool checks it',
  'memory.writtenFromTheMonth5ReadingNotes': 'Written from the month 5 reading notes.',
  // memoryCard ──────────────────────────────────────────────────
  'memoryCard.noMemoryServiceIsConnectedInThisPhase':
    'No memory service is connected in this phase, so this action is inert.',
  // memoryPage ──────────────────────────────────────────────────
  'memoryPage.aFreshlyStartedProfileHasNoRecordsThat':
    'A freshly started profile has no records. That is stated, not disguised with placeholder rows.',
  'memoryPage.anEmptyResultStatesWhichFilterProducedIt':
    'An empty result states which filter produced it.',
  'memoryPage.fourStatesEachWithWhatItMeansFor':
    'Four states, each with what it means for a reader.',
  'memoryPage.knowledgeBoard': 'Knowledge board',
  'memoryPage.knowledgeIsFiledByWhatItIsFor':
    'Knowledge is filed by what it is for, not by when it was learned.',
  'memoryPage.literalTextMatchingOverTheIllustrativeSetPlus':
    'Literal text matching over the illustrative set, plus trust filters',
  'memoryPage.liveRecordsOnlyArchivedItemsAreKeptAnd':
    'Live records only; archived items are kept and shown under History.',
  'memoryPage.sourceKind': 'Source kind',
  'memoryPage.thePreviewFilterMatchesLiteralTextOnlySemantic':
    'The preview filter matches literal text only. Semantic retrieval — embeddings, ranking and trust-filtered recall — is not connected, so an empty result here does not mean the knowledge base is empty.',
  'memoryPage.trustState': 'Trust state',
  'memoryPage.unverifiedRecordsMayBeUsedAsContextBut':
    'Unverified records may be used as context, but they are labelled uncertainty and can never be presented as fact.',
  'memoryPage.whatTheAgentMayUseWhereEachClaim':
    'What the agent may use, where each claim came from and how much it may be trusted. Retrieval never turns unverified text into fact.',
  'memoryPage.whereTheRecordCameFromAnIndependent':
    'Where the record came from — an independent question from how much it is trusted',
  // memoryTimeline ──────────────────────────────────────────────
  'memoryTimeline.aRecordWithNoTimelineHasNeverBeen':
    'A record with no timeline has never been revised, verified or tombstoned.',
  'memoryTimeline.created': 'Created',
  'memoryTimeline.revised': 'Revised',
  'memoryTimeline.tombstoned': 'Tombstoned',
  'memoryTimeline.trustRaised': 'Trust raised',
  'memoryTimeline.verificationRequested': 'Verification requested',
  // metricsPanel ────────────────────────────────────────────────
  'metricsPanel.aHighWinRateWithNegativeAverageR':
    'A high win rate with negative average R still loses money. Expectancy is the number that matters.',
  'metricsPanel.confidenceDescribesTheSampleItIsNotA':
    'Confidence describes the sample. It is not a probability about the next trade.',
  'metricsPanel.maxDrawdown': 'Max drawdown',
  'metricsPanel.metricsAppearOnceADeterministicEvaluationHasRun':
    'Metrics appear once a deterministic evaluation has run over a fixed data set. This experiment has not been evaluated, so there are no numbers to show.',
  'metricsPanel.sampleSize': 'Sample size',
  'metricsPanel.zeroesAreNeverShownInPlaceOfA':
    'Zeroes are never shown in place of a missing measurement.',
  // mistakeAnalysisCard ─────────────────────────────────────────
  'mistakeAnalysisCard.emptyIsStatedNotHidden': 'Empty is stated, not hidden.',
  'mistakeAnalysisCard.mistakePatternsAppearOnceAGradedAttemptHas':
    'Mistake patterns appear once a graded attempt has incorrect answers. An ungraded attempt produces no analysis.',
  // performanceChart ────────────────────────────────────────────
  'performanceChart.anEmptyChartIsLeftEmptyRatherThan':
    'An empty chart is left empty rather than filled with a placeholder series.',
  // portfolio ───────────────────────────────────────────────────
  'portfolio.aConcentrationFigureStatesHowMuch':
    'A concentration figure states how much of the composition sits in one place. It is an observation about what you declared, not a recommendation to change it, and it says nothing about whether that position is a good one.',
  'portfolio.aSingleCurrencySoThePriced':
    'A single currency, so the priced positions can be summed into one total.',
  'portfolio.aVersionIsNeverRewrittenAn':
    'A version is never rewritten. An analysis can therefore still be traced back to the exact composition it was computed from.',
  'portfolio.addPosition': 'Add position',
  'portfolio.blankStaysBlank': 'blank stays blank',
  'portfolio.byAssetClassFromMarketValues': 'By asset class, from market values',
  'portfolio.byCurrencySummedOnlyWithinEach': 'By currency, summed only within each currency',
  'portfolio.byDeclaredWeight': 'By declared weight',
  'portfolio.byMarketValue': 'By market value',
  'portfolio.changedBy': 'changed by',
  'portfolio.complete': 'complete',
  'portfolio.concentration': 'Concentration',
  'portfolio.costBasis': 'Cost basis',
  'portfolio.couldNotReadThePortfolio': 'Could not read the portfolio',
  'portfolio.coverage': 'Coverage:',
  'portfolio.currenciesInTheDocument': 'Currencies in the document',
  'portfolio.dataQuality': 'Data quality',
  'portfolio.decidedBy': 'decided by',
  'portfolio.declareTheComposition': 'Declare the composition',
  'portfolio.description':
    'The composition you have declared, valued by deterministic code — with every gap named rather than filled.',
  'portfolio.dismiss': 'Dismiss',
  'portfolio.eGVOO': 'e.g. VOO',
  'portfolio.engineVerdict': 'engine verdict:',
  'portfolio.everyEarlierVersionIsKeptAnd':
    '. Every earlier version is kept and was not rewritten.',
  'portfolio.everyFigureIsComputedOnThe': 'every figure is computed on the server',
  'portfolio.everyFigureWasComputedOnThe':
    'Every figure was computed on the server from what you declared. An em dash is a figure that does not exist, and the Findings column says which kind of absence it was.',
  'portfolio.everyPositionDeclaredCarriesWhatA':
    'Every position declared carries what a calculation needs.',
  'portfolio.everyPositionValued': 'every position valued',
  'portfolio.exposure': 'Exposure',
  'portfolio.figureSNotProduced': 'figure(s) not produced',
  'portfolio.findings': 'Findings',
  'portfolio.findingsWorstIs': 'findings: worst is',
  'portfolio.fromDeclaredInputs': 'from declared inputs',
  'portfolio.largestShares': 'Largest shares',
  'portfolio.limitations': 'Limitations',
  'portfolio.limitationsThisAnswerCarries': 'Limitations this answer carries',
  'portfolio.marketValue': 'Market value',
  'portfolio.measuredNotScored': 'measured, not scored',
  'portfolio.missingHoldingData': 'Missing holding data',
  'portfolio.moreThanOneCurrencyAndNo':
    'More than one currency and no rate source is wired, so the totals are grouped rather than converted.',
  'portfolio.moreThanOneCurrencyAndNo2':
    'More than one currency and no rate source: the groups are reported separately rather than converted into one figure.',
  'portfolio.newestFirst': 'newest first',
  'portfolio.noConcentrationObservationWasMade': 'no concentration observation was made',
  'portfolio.noExposureCanBeDescribedBecause':
    'No exposure can be described, because no position could be valued. Nothing is shown in place of it: a share of a total that does not exist is not a share.',
  'portfolio.noFindings': 'no findings',
  'portfolio.noObservations': 'No observations',
  'portfolio.noPopulationOfSharesCouldBe':
    'No population of shares could be formed, so no concentration figure exists. The gaps panel says what is missing, rather than this card showing a concentration of zero.',
  'portfolio.noPortfolioToShow': 'No portfolio to show',
  'portfolio.noPositionHasBothAQuantity':
    'No position has both a quantity and a current price, so there is no value to report.',
  'portfolio.noPositionsDeclared': 'No positions declared',
  'portfolio.noPositionsToShow': 'No positions to show',
  'portfolio.noReadinessVerdictWasProducedSo':
    'No readiness verdict was produced, so nothing is claimed about whether an analysis may run.',
  'portfolio.noSharesOfThisKindCould':
    'No shares of this kind could be formed, so nothing is drawn here. That is the honest answer rather than a chart of zeroes: every bar would imply a measurement that does not exist.',
  'portfolio.noVersionHasBeenWrittenBecause':
    'No version has been written, because no composition has been declared for this account.',
  'portfolio.notBuiltYet': 'not built yet',
  'portfolio.notDeclaredYet': 'not declared yet',
  'portfolio.nothingHereIsValuedInThe':
    'Nothing here is valued in the browser, and no figure is sent with the request. The server stores the declaration, appends a version and computes every number from it.',
  'portfolio.nothingInThisPopulationCouldBe':
    'Nothing in this population could be grouped, so there is no breakdown to show.',
  'portfolio.nothingIsMissingEveryFigureThese':
    'Nothing is missing: every figure these scopes ask for could be produced from what is declared.',
  'portfolio.nothingIsStoredYet': 'Nothing is stored yet',
  'portfolio.observationS': 'observation(s)',
  'portfolio.observed': 'observed',
  'portfolio.ofTheDeclaredDocumentAShare':
    'of the declared document. A share here is a share of this population only — never of a mixture of declared weights and market values.',
  'portfolio.partialValuation': 'partial valuation',
  'portfolio.portfolioReadiness': 'Portfolio readiness',
  'portfolio.portfolioSections': 'Portfolio sections',
  'portfolio.portfolioValue': 'Portfolio value',
  'portfolio.position': 'position',
  'portfolio.position2': 'Position',
  'portfolio.positions': 'Positions',
  'portfolio.price': 'price',
  'portfolio.priceFreshness': 'Price freshness',
  'portfolio.quantity': 'Quantity',
  'portfolio.replacesTheCurrentVersion': 'replaces the current version',
  'portfolio.scopeSBlocked': 'scope(s) blocked',
  'portfolio.theDeclarationWasNotStored': 'The declaration was not stored',
  'portfolio.theDeclarationWasRejectedByThe': 'The declaration was rejected by the server:',
  'portfolio.theDeclarationWasStoredAsVersion': 'The declaration was stored as version',
  'portfolio.theDocumentDeclaresMorePositionsThan':
    'The document declares more positions than the engine reads at once, so only the first ones were used. The rest were not silently included.',
  'portfolio.theEngineProducedNoInsightFor':
    'The engine produced no insight for this composition. That is not a clean bill of health: it means there was nothing it could observe — most often because too little was declared for a figure to exist at all. The gaps panel says which figures those are.',
  'portfolio.thePricedPositionsAreNotAll':
    'The priced positions are not all in one currency, so a single total is not produced. Each currency is reported on its own: converting them would need a rate, and no rate source is wired.',
  'portfolio.theTwoLayersOfTheSame':
    'The two layers of the same verdict, shown separately: what your declared context allows, and what the document supports.',
  'portfolio.theWorseOfTwoReadingsDecides': 'the worse of two readings decides',
  'portfolio.thisIsNotAPortfolioWorth':
    'This is not a portfolio worth nothing — it is a composition the product cannot value yet. A zero here would have been a factual claim, which is why none is shown.',
  'portfolio.total': 'total',
  'portfolio.twoPopulationsAreShownBecauseBoth':
    'Two populations are shown because both can be formed. Where they disagree, the difference is between what you declared and what the prices say — not an error in either.',
  'portfolio.unrealisedPL': 'Unrealised P/L',
  'portfolio.version': 'version',
  'portfolio.versionHistory': 'Version history',
  'portfolio.versionSShown': 'version(s) shown',
  'portfolio.weight': 'Weight',
  'portfolio.whatTheseFiguresRestOn': 'What these figures rest on',
  'portfolio.whatThisRestsOn': 'What this rests on',
  'portfolio.whatWouldUnblockIt': 'What would unblock it',
  'portfolio.worst': 'worst:',
  // portfolioOverview ───────────────────────────────────────────
  'portfolioOverview.costBasisKnown': 'Cost basis known',
  'portfolioOverview.everythingInTheDocumentAsStored': 'Everything in the document, as stored',
  'portfolioOverview.positionWithAQuantityAndAnEntryPrice':
    'Position with a quantity and an entry price',
  'portfolioOverview.positionWithAUsableQuantityAndPrice':
    'Position with a usable quantity and price',
  'portfolioOverview.positionsACalculationCouldReadAtAll':
    'Positions a calculation could read at all',
  'portfolioOverview.positionsDeclared': 'Positions declared',
  'portfolioOverview.priced': 'Priced',
  'portfolioOverview.usable': 'Usable',
  // portfolioPage ───────────────────────────────────────────────
  'portfolioPage.allocation': 'Allocation',
  'portfolioPage.declare': 'Declare',
  'portfolioPage.holdings': 'Holdings',
  'portfolioPage.nothingHasBeenDeclaredForThisAccountSo':
    'Nothing has been declared for this account, so there is nothing to value. Open the Declare tab to describe the composition — a quantity, a price, a declared share, or any combination of the three.',
  'portfolioPage.quality': 'Quality',
  'portfolioPage.savingHereCreatesVersion1OfTheDeclaration':
    'Saving here creates version 1 of the declaration. Every later save appends a version; none of them rewrites an earlier one.',
  // portfolioPanels ─────────────────────────────────────────────
  'portfolioPanels.aDeclaredShareExists': 'A declared share exists',
  'portfolioPanels.afterTheBoundIsApplied': 'After the bound is applied',
  'portfolioPanels.costed': 'Costed',
  'portfolioPanels.declaredWeightSum': 'Declared weight sum',
  'portfolioPanels.notMalformed': 'Not malformed',
  'portfolioPanels.positionsRead': 'Positions read',
  'portfolioPanels.quantityAndEntryPriceBothUsable': 'Quantity and entry price both usable',
  'portfolioPanels.quantityAndPriceBothUsable': 'Quantity and price both usable',
  'portfolioPanels.sharesAreMeantToAddUpToA': 'Shares are meant to add up to a whole portfolio',
  'portfolioPanels.weighted': 'Weighted',
  // portfolioValueCard ──────────────────────────────────────────
  'portfolioValueCard.ofTheDeclaredWeightsHowMuchThePriced':
    'Of the declared weights, how much the priced positions account for',
  'portfolioValueCard.pricedShare': 'Priced share',
  'portfolioValueCard.unrealisedReturn': 'Unrealised return',
  // profile ─────────────────────────────────────────────────────
  'profile.addConstraint': 'Add constraint',
  'profile.addHolding': 'Add holding',
  'profile.analysisReadiness': 'Analysis readiness',
  'profile.answer': 'Answer',
  'profile.areTheExamplesUsedInThis': 'are the examples used in this description.',
  'profile.array.10k-50k': '10,000 – 50,000',
  'profile.array.1k-10k': '1,000 – 10,000',
  'profile.array.50k-250k': '50,000 – 250,000',
  'profile.array.advanced': 'Advanced',
  'profile.array.balanced': 'Balanced',
  'profile.array.beginner': 'Beginner',
  'profile.array.capital-preservation': 'Capital preservation',
  'profile.array.chart-reading': 'Chart reading',
  'profile.array.commodity': 'Commodities',
  'profile.array.crypto': 'Crypto',
  'profile.array.day-trading': 'Day trading',
  'profile.array.equity': 'Equities',
  'profile.array.fx': 'Foreign exchange',
  'profile.array.growth-oriented': 'Growth oriented',
  'profile.array.index': 'Indices',
  'profile.array.intermediate': 'Intermediate',
  'profile.array.journaling-review': 'Journaling and review',
  'profile.array.market-structure': 'Market structure',
  'profile.array.over-250k': 'Over 250,000',
  'profile.array.position': 'Position trading',
  'profile.array.prefer-not-to-say': 'Prefer not to say',
  'profile.array.psychology-discipline': 'Psychology and discipline',
  'profile.array.risk-management': 'Risk management',
  'profile.array.scalping': 'Scalping',
  'profile.array.strategy-development': 'Strategy development',
  'profile.array.swing': 'Swing trading',
  'profile.array.under-1k': 'Under 1,000',
  'profile.array.unspecified': 'Prefer not to say',
  'profile.assessingTheDeclaredInputs': 'Assessing the declared inputs',
  'profile.assumed': 'Assumed',
  'profile.assumed2': 'assumed ·',
  'profile.boundariesYouWantRespectedInYour':
    'Boundaries you want respected, in your own words. A preference, not an instruction to trade — anything that reads like an order is refused on save.',
  'profile.confirmed': 'Confirmed',
  'profile.confirmed2': 'confirmed ·',
  'profile.constraintsAndPreferences': 'Constraints and preferences',
  'profile.contextCompleteness': 'Context completeness',
  'profile.contextHistory': 'Context history',
  'profile.couldNotAssessTheDeclaredInputs': 'Could not assess the declared inputs',
  'profile.couldNotReadTheProfile': 'Could not read the profile',
  'profile.declarationsThatDoNotFitTogether': 'Declarations that do not fit together',
  'profile.declaredByYou': 'Declared by you',
  'profile.declaredContext': 'Declared context',
  'profile.derived': 'derived ·',
  'profile.deterministicChecksOverWhatYouHave':
    'Deterministic checks over what you have declared and what each capability declares it needs. No language model is consulted.',
  'profile.eURUSDAAPLBTCUSD': 'EURUSD, AAPL, BTCUSD',
  'profile.everyRequiredFieldIsCurrent': 'Every required field is current',
  'profile.everyRequiredFieldIsCurrentThe':
    'Every required field is current. The analysis capabilities can answer the questions these inputs support.',
  'profile.everyValueIsLabelledWithWhere':
    'Every value is labelled with where it came from and whether it is still current.',
  'profile.existingHoldings': 'Existing holdings',
  'profile.fieldLabels': 'Field labels:',
  'profile.fieldSOpen': 'field(s) open',
  'profile.fieldsTheValueItsSourceAnd':
    'fields. The value, its source and its age are shown together, because a value without its source is a value you cannot weigh.',
  'profile.howToReadThisPage': 'How to read this page',
  'profile.learningGoals': 'Learning goals',
  'profile.marketDataForThisDeployment': 'Market data for this deployment:',
  'profile.mayBeOutdated': 'May be outdated',
  'profile.mayBeOutdated2': 'may be outdated ·',
  'profile.mayEachAnalysisRunAndIn': 'May each analysis run, and in what form?',
  'profile.missing': 'Missing',
  'profile.missing2': 'missing',
  'profile.noHoldingsDescribedAnalysisThatDepends':
    'No holdings described. Analysis that depends on them will say so.',
  'profile.noProfileToShowYet': 'No profile to show yet',
  'profile.noSinglePositionAbove10Of': 'No single position above 10% of the portfolio',
  'profile.noVersionsYet': 'No versions yet',
  'profile.notProvided': 'Not provided',
  'profile.notProvidedItIsNeverTreated':
    '— not provided. It is never treated as a fact, and it never appears pre-filled in the editor.',
  'profile.note': 'Note:',
  'profile.nothingIsStoredCapabilitiesThatNeed':
    '— nothing is stored. Capabilities that need it ask, or stay limited and say why.',
  'profile.nothingOutstanding': 'Nothing outstanding',
  'profile.observed': 'Observed',
  'profile.onlyWhatYouTellUsIs':
    'Only what you tell us is stored as a fact. Anything left blank stays missing and is asked about instead of guessed.',
  'profile.optional': 'optional',
  'profile.optionalAndByPercentageOnlyThere':
    'Optional, and by percentage only. There is no field for a quantity, a price or a cost basis — a description of an allocation does not need to be a financial record.',
  'profile.preferredMarkets': 'Preferred markets',
  'profile.profile': 'Profile',
  'profile.profileSections': 'Profile sections',
  'profile.reason.assumed': 'Assumed, not stated',
  'profile.reason.missing': 'Not provided',
  'profile.reason.stale': 'May be out of date',
  'profile.requiredFields': 'required fields',
  'profile.shareOfTheFieldsTheAnalysis':
    'Share of the fields the analysis capabilities require that carry a value you have actually given us. Missing fields are asked about, never filled in.',
  'profile.someContextIsStillMissing': 'Some context is still missing',
  'profile.source.assumed': 'Not stated — assumption only',
  'profile.source.derived': 'Computed from what you stated',
  'profile.source.user-stated': 'You stated this',
  'profile.status.assumed': 'Assumed',
  'profile.status.confirmed': 'Confirmed',
  'profile.status.derived': 'Derived',
  'profile.status.missing': 'Missing',
  'profile.status.stale': 'May be outdated',
  'profile.status2.assumed':
    'Not provided by you. It may be used only as an assumption, never as a fact.',
  'profile.status2.confirmed': 'You told us this, and it is inside its freshness window.',
  'profile.status2.derived': 'Computed from other values you gave us, not stated directly.',
  'profile.status2.missing': 'Not provided. The system will ask rather than fill it in.',
  'profile.status2.stale':
    'You told us this, but it has aged past its freshness window for this kind of input.',
  'profile.theAssessmentFailed': 'The assessment failed',
  'profile.theContextWasNotSaved': 'The context was not saved',
  'profile.theSameGateTheAgentConsults':
    'The same gate the agent consults before a model is asked to reason. It is evaluated here from the stored context, on the server, so the answer you read and the answer the agent acts on are one and the same.',
  'profile.theSessionHasNotBeenResolvedYet': 'The session has not been resolved yet.',
  'profile.theseAreAskedRatherThanDefaulted':
    'These are asked rather than defaulted. If you would rather not answer, the analysis stays limited and says which input it is missing.',
  'profile.theseAreSurfacedAsQuestionsNot':
    'These are surfaced as questions, not resolved by choosing one side for you.',
  'profile.total': 'Total',
  'profile.tradingPreferences': 'Trading preferences',
  'profile.untilTheseAreAnsweredCapabilitiesThat':
    'Until these are answered, capabilities that require them produce limited analysis or decline to be precise rather than substituting a default.',
  'profile.versionsAreAppendOnlyASave':
    'Versions are append-only. A save adds a version; nothing is rewritten, so the context an answer was given from stays recoverable.',
  'profile.weakestRequiredField': 'Weakest required field',
  'profile.whatIStillNeedFromYou': 'What I still need from you',
  'profile.youToldUsThisButIt':
    '— you told us this, but it has aged past the window for this kind of input.',
  'profile.youToldUsThisInsideIts': '— you told us this, inside its freshness window.',
  // profileEditor ───────────────────────────────────────────────
  'profileEditor.aBandNeverAnAmountThereIsNo':
    'A band, never an amount: there is no field here for a balance.',
  'profileEditor.capitalRange': 'Capital range',
  'profileEditor.commaSeparatedOptionalLeaveBlankIfYou':
    'Comma separated. Optional — leave blank if you would rather not list them.',
  'profileEditor.declaredByYouTheSystemNeverAssignsOne':
    'Declared by you. The system never assigns one, and “prefer not to say” is a valid answer.',
  'profileEditor.experienceLevel': 'Experience level',
  'profileEditor.horizon': 'Horizon',
  'profileEditor.howMuchTradingExperienceYouWouldSayYou':
    'How much trading experience you would say you have.',
  'profileEditor.overWhatHorizonYouUsuallyHoldAPosition':
    'Over what horizon you usually hold a position.',
  'profileEditor.preferredInstruments': 'Preferred instruments',
  'profileEditor.primaryTimeframe': 'Primary timeframe',
  'profileEditor.riskTolerance': 'Risk tolerance',
  'profileEditor.tradingStyle': 'Trading style',
  // profilePage ─────────────────────────────────────────────────
  'profilePage.nothingIsInferredToFillTheGapThe':
    'Nothing is inferred to fill the gap: the fields stay empty and the affected analysis stays limited.',
  'profilePage.preferences': 'Preferences',
  'profilePage.savingPreferencesCreatesTheFirstVersionOfYour':
    'Saving preferences creates the first version of your context.',
  'profilePage.theAgentMayOnlyUseYourDeclaredContext':
    'The agent may only use your declared context as input. It never writes to it, and it never fills a blank with a default.',
  'profilePage.yourDeclaredTradingContextWhatYouHaveTold':
    'Your declared trading context: what you have told Master Trade, and what is still open.',
  // quality ─────────────────────────────────────────────────────
  'quality.assessed': 'assessed',
  'quality.blocking': 'Blocking',
  'quality.code.allocation-exceeds-portfolio': 'Allocation exceeds a whole portfolio',
  'quality.code.assumed-value': 'Not provided — treated as an assumption',
  'quality.code.conflicting-declarations': 'Two declarations that cannot both hold',
  'quality.code.constraint-is-instruction': 'Written as an instruction rather than a constraint',
  'quality.code.duplicate-entry': 'Repeated entry',
  'quality.code.empty-list': 'Empty list',
  'quality.code.malformed-symbol': 'Malformed symbol',
  'quality.code.missing-helpful': 'Would sharpen the analysis',
  'quality.code.missing-provenance': 'No provenance recorded',
  'quality.code.missing-required': 'Required and not provided',
  'quality.code.negative-value': 'Negative value',
  'quality.code.non-finite-number': 'Not a finite number',
  'quality.code.not-a-number': 'Not a number',
  'quality.code.out-of-range': 'Outside its range',
  'quality.code.risk-horizon-tension': 'Risk and horizon point different ways',
  'quality.code.stale-value': 'Aged past its freshness window',
  'quality.code.unavailable-input': 'Input not available',
  'quality.code.undated-claim': 'Stated with no observation time',
  'quality.code.unknown-token': 'Not one of the supported values',
  'quality.code.unsupported-market': 'Market the system cannot work in',
  'quality.code.unsupported-timeframe': 'Timeframe the system cannot work in',
  'quality.code.untrusted-provenance': 'Provenance cannot be verified',
  'quality.dimension.completeness': 'Completeness',
  'quality.dimension.confidence': 'Confidence',
  'quality.dimension.consistency': 'Consistency',
  'quality.dimension.freshness': 'Freshness',
  'quality.dimension.provenance': 'Provenance',
  'quality.dimension.relevance': 'Relevance',
  'quality.dimension.reliability': 'Reliability',
  'quality.dimension.validity': 'Validity',
  'quality.dimensions': 'Dimensions',
  'quality.everyInputTheSystemCanCurrently':
    'Every input the system can currently ask about is present and usable. This is not a statement that the answer will be complete — only that it will not be missing a declared requirement.',
  'quality.findingsBehindThisVerdict': 'Findings behind this verdict',
  'quality.howGoodAreTheDeclaredInputs': 'How good are the declared inputs?',
  'quality.inputQualitySummary': 'Input quality summary',
  'quality.inputSMissing': 'input(s) missing',
  'quality.inputsThatAreMissing': 'Inputs that are missing',
  'quality.limitationsThisAnswerWouldCarry': 'Limitations this answer would carry',
  'quality.missingInformation': 'Missing information',
  'quality.noProvenanceRecorded': 'No provenance recorded',
  'quality.noScoreVerdictsAndNamedCounts': 'No score — verdicts and named counts only',
  'quality.nothingRequiredIsMissing': 'Nothing required is missing',
  'quality.origin.system': 'System substitution — refused',
  'quality.origin.user-premise': 'You declared this premise',
  'quality.questionS': 'question(s)',
  'quality.reason.assumed': 'currently an assumption',
  'quality.reason.conflicting': 'conflicts with another answer',
  'quality.reason.missing': 'not provided yet',
  'quality.reason.refused-to-say': 'you chose not to say',
  'quality.reason.stale': 'out of date',
  'quality.recorded': 'recorded',
  'quality.source.derived': 'Derived',
  'quality.source.market-data': 'Market data',
  'quality.source.system': 'System',
  'quality.source.user': 'You',
  'quality.substitutionsAndPremises': 'Substitutions and premises',
  'quality.theInputsWereAssessedAndThe':
    'The inputs were assessed and the verdict stands. This capability has not been built yet, so no analysis is produced — that is a gap in the product, not a problem with your inputs.',
  'quality.trust.authoritative':
    'An authoritative source: the system read it directly rather than being told.',
  'quality.trust.unverified':
    'Nothing confirms this beyond the claim itself, so it cannot be weighed fully.',
  'quality.trust.verified': 'Confirmed against a source the system can point at.',
  'quality.validationFindings': 'Validation findings',
  'quality.whatCanStillBeAnalysed': 'What can still be analysed',
  'quality.whatIsNotKnownYet': 'What is not known yet',
  'quality.why': 'Why:',
  'quality.wouldSharpenTheAnswer': 'Would sharpen the answer',
  'quality.youHaveNotDeclaredATrading':
    'You have not declared a trading context yet, so every input below is legitimately absent. This report describes that empty context rather than a shortlist of things you did wrong.',
  // questionPanel ───────────────────────────────────────────────
  'questionPanel.theAnswerKeyNeverReachesTheClientBefore':
    'The answer key never reaches the client before submission; grading happens server-side against the rubric.',
  // realtime ────────────────────────────────────────────────────
  'realtime.1284RowsAccepted12RejectedForAMissing':
    '1,284 rows accepted; 12 rejected for a missing timestamp. Rejected rows are listed, never dropped silently.',
  'realtime.1Fact1Analysis1UncertaintyChainOfThought':
    '1 fact, 1 analysis, 1 uncertainty — chain-of-thought is never emitted.',
  'realtime.aLifecycleTransitionTheTurnIsNotFinished':
    'A lifecycle transition. The turn is not finished until a summary arrives.',
  'realtime.aProposedRuleIsWaitingForYourDecision': 'A proposed rule is waiting for your decision',
  'realtime.activity': 'Activity',
  'realtime.activityPreviewNotice':
    'Interface preview — mock data only, no backend or AI connected.',
  'realtime.agentActivity': 'Agent activity',
  'realtime.answerRiskPerTradeFollowsFromTheStop':
    'Answer: risk per trade follows from the stop distance, not from the position size.',
  'realtime.attempt': 'attempt',
  'realtime.attempts': 'Attempts',
  'realtime.backgroundTasks': 'Background tasks',
  'realtime.cancelledByTheUserBeforeTheFirstSection':
    'cancelled by the user before the first section was written',
  'realtime.cancellingRecordsWhoAskedInThe':
    'Cancelling records who asked in the audit trail. Starting a task is not offered here: background work is enqueued by the server, under its own permission and approval gate.',
  'realtime.clearThisList': 'Clear this list',
  'realtime.completed': 'completed ·',
  'realtime.correlation': 'correlation',
  'realtime.correlation2': 'Correlation',
  'realtime.datasetValidated': 'Dataset validated',
  'realtime.entries': 'entries',
  'realtime.eventsDelivered': 'Events delivered',
  'realtime.from': 'from',
  'realtime.ingestionIsPausedAndWillRetryWithBackoff':
    'Ingestion is paused and will retry with backoff. No live data is claimed while it is down.',
  'realtime.jobPreviewNotice':
    'Preview fixtures: these job records are static samples from the queue schema. No worker is running in this preview.',
  'realtime.keepItRunning': 'Keep it running',
  'realtime.lesson4Of6CompleteInPositionSizing':
    'Lesson 4 of 6 complete in “Position sizing and risk of ruin”.',
  'realtime.marketDataIngestFailedPROVIDERUNAVAILABLE':
    'marketData.ingest failed: PROVIDER_UNAVAILABLE.',
  'realtime.marketDataProviderUnavailable': 'Market-data provider unavailable',
  'realtime.nextAttemptInAbout': 'Next attempt in about',
  'realtime.pROVIDERUNAVAILABLETheSyntheticProviderFixtureIsNotR':
    'PROVIDER_UNAVAILABLE: the synthetic provider fixture is not running.',
  'realtime.previewNotice':
    'Preview fixtures: a deterministic sample of what the stream carries, not a live connection.',
  'realtime.progressOnlyTheJobIsStillRunning': 'Progress only; the job is still running.',
  'realtime.provenance': 'provenance:',
  'realtime.queued': 'queued ·',
  'realtime.reasonOptional': 'Reason (optional)',
  'realtime.reconnectS': 'reconnect(s)',
  'realtime.reportedUnit': 'Reported unit:',
  'realtime.retryingWillNotHelpUntilThis': 'Retrying will not help until this changes.',
  'realtime.running': 'running ·',
  'realtime.s': 's.',
  'realtime.staleDropped': 'Stale, dropped',
  'realtime.status.cancelled': 'Cancelled',
  'realtime.status.dead-letter': 'Stopped after exhausting retries',
  'realtime.status.failed': 'Failed — will retry',
  'realtime.status.queued': 'Queued',
  'realtime.status.running': 'Running',
  'realtime.status.succeeded': 'Completed',
  'realtime.stopThisTask': 'Stop this task',
  'realtime.stopped': 'stopped',
  'realtime.theEvaluationFinishedButActivationNeedsARecorded':
    'The evaluation finished, but activation needs a recorded human approval. The system cannot adopt its own proposal.',
  'realtime.theJobListCouldNotBe': 'The job list could not be read',
  'realtime.theQueueCannotBeRead': 'The queue cannot be read',
  'realtime.theServerIsShuttingDownRetryingIn08s':
    'The server is shutting down. Retrying in 0.8s (attempt 2).',
  'realtime.theseArePreviewRecords': 'These are preview records',
  'realtime.thisTaskCanNoLongerBe': 'This task can no longer be stopped',
  'realtime.typedCodeNoStackTraceNoProviderPayload':
    'Typed code, no stack trace, no provider payload.',
  'realtime.unreadableDropped': 'Unreadable, dropped',
  // reportViewer ────────────────────────────────────────────────
  'reportViewer.noResearchServiceIsConnectedInThisPhase':
    'No research service is connected in this phase, so export is inert.',
  'reportViewer.reportsAreAssembledFromStoredEvaluationRowsOnce':
    'Reports are assembled from stored evaluation rows once an evaluation exists.',
  // research ────────────────────────────────────────────────────
  'research.a465WinRateWithPositiveAverageR':
    'A 46.5% win rate with positive average R is consistent with the risk-first lesson; it is not evidence of an edge.',
  'research.a58WinRateWithNegative':
    'A 58% win rate with negative average R is the textbook shape of hidden tail risk. Expectancy is what the evaluation is about.',
  'research.aDeterministicReplayOf240PracticeSetupsSuggests':
    'A deterministic replay of 240 practice setups suggests the written invalidation level is the variable that changes sizing outcomes. The result is illustrative and the confidence is below the promotion bar.',
  'research.aHighWinRateWithANegativeAverage':
    'A high win rate with a negative average R is the textbook shape of a hidden tail risk.',
  'research.aPromisingResultStaysInactiveUntil':
    'A promising result stays inactive until a person decides. The system cannot adopt its own proposal.',
  'research.aReRunAddsANew':
    'A re-run adds a new evaluation with its own sample size, so an earlier verdict stays readable in the context it was reached in.',
  'research.aReportCanRecommendContinuingOr':
    'A report can recommend continuing or stopping the study. Adopting a rule is a separate, human-approved action.',
  'research.aRunningExperimentWithNoEvaluation':
    'A running experiment with no evaluation yet shows an empty metrics panel.',
  'research.abandoned': 'Abandoned',
  'research.abandonedAt38TradesRecordedAsARejection':
    'Abandoned at 38 trades. Recorded as a rejection, not quietly deleted.',
  'research.abandonedWithItsReasonRecordedTheSampleWas':
    'Abandoned with its reason recorded: the sample was too small to rescue by tuning.',
  'research.aboutThisSampleNotTheFuture': 'about this sample, not the future',
  'research.activeExperiments': 'Active experiments',
  'research.anUnevaluatedExperimentShowsNoMetrics':
    'An unevaluated experiment shows no metrics at all — never zeroes, which would read as a measured flat result.',
  'research.approvalIsExplicit': 'Approval is explicit',
  'research.approvalRequestedBeforeAnyActivationTheRuleStays':
    'Approval requested before any activation; the rule stays inactive until a decision is recorded.',
  'research.assembledFromEvidence': 'assembled from evidence',
  'research.assembledFromStoredEvaluationRowsNoModelText':
    'Assembled from stored evaluation rows; no model text is included.',
  'research.at96TradesTheIntervalAroundAverageR':
    'At 96 trades the interval around average R still contains zero.',
  'research.avgR': 'Avg R',
  'research.awaitingAHumanDecision': 'awaiting a human decision.',
  'research.awaitingARecordedHumanApproval': 'Awaiting a recorded human approval',
  'research.backlogBlockedOnAnEventCalendarAndDelistingAware':
    'Backlog: blocked on an event calendar and delisting-aware data.',
  'research.backlogItemNoEvidenceAttachedYet': 'Backlog item; no evidence attached yet.',
  'research.bucketSizesAreUnequalSoTheComparisonIs':
    'Bucket sizes are unequal, so the comparison is not yet fair.',
  'research.cannotBeEvaluatedUntilTheDataSetIncludes':
    'Cannot be evaluated until the data set includes delisted and halted symbols.',
  'research.caveats': 'Caveats',
  'research.checklistComplianceIsTheVariableThatMovedNot':
    'Checklist compliance is the variable that moved, not market conditions.',
  'research.confidence': 'Confidence',
  'research.confidenceCaveat':
    'Confidence is a statement about the sample, not about the future. A result below the minimum sample size is a reason to keep testing, not a reason to trade it.',
  'research.confidenceIsTheHighestOnRecordAndStill':
    'Confidence is the highest on record, and still not a licence to skip review.',
  'research.confidenceOf62IsBelowTheBarThis':
    'Confidence of 62% is below the bar this project set for promoting anything.',
  'research.continuingIsAStudyDecisionNotATrading':
    'Continuing is a study decision, not a trading one. If the checklist is formally adopted, that is a rule change and requires a recorded human approval before it can be active.',
  'research.decisionNotActivation': 'Decision, not activation',
  'research.decisionRequired': 'Decision required',
  'research.deterministicEvaluationOverTheSyntheticSetEvidenceAp':
    'Deterministic evaluation over the synthetic set; evidence appended, never edited.',
  'research.deterministicOutputOverAFixedData':
    'Deterministic output over a fixed data set — never a model estimate',
  'research.eachSetupWasReplayedWithAFixedRisk':
    'Each setup was replayed with a fixed risk budget. Half carried a written invalidation level before entry, half did not. Sizing errors were counted by rule, not judged by eye.',
  'research.evaluatedTrades': 'Evaluated trades',
  'research.evidenceIsAppended': 'Evidence is appended',
  'research.experimentStatus.abandoned': 'Abandoned',
  'research.experimentStatus.awaiting-approval': 'Awaiting approval',
  'research.experimentStatus.complete': 'Complete',
  'research.experimentStatus.planned': 'Planned',
  'research.experimentStatus.running': 'Running',
  'research.experimentVerdict.inconclusive': 'Inconclusive',
  'research.experimentVerdict.pending': 'No verdict yet',
  'research.experimentVerdict.promising': 'Promising',
  'research.experimentVerdict.rejected': 'Rejected',
  'research.experiments': 'experiments ·',
  'research.experimentsInFlight': 'Experiments in flight',
  'research.exportReport': 'Export report',
  'research.fadingTheRangeEdgeWithATightInvalidation':
    'Fading the range edge with a tight invalidation level has positive expectancy.',
  'research.findingsSummary': 'Findings summary',
  'research.gapContinuationAfterEarnings': 'Gap continuation after earnings',
  'research.generated': '· generated',
  'research.hypothesis': 'Hypothesis',
  'research.hypothesisWrittenBeforeAnyDataWasReviewed':
    'Hypothesis written before any data was reviewed.',
  'research.limitation': 'Limitation',
  'research.limitationsAreRenderedAlongsideTheFindings':
    'Limitations are rendered alongside the findings, not in a footnote, so a report is not read as a green light.',
  'research.loadingAndEmpty': 'Loading and empty',
  'research.lossPerTradeIsUnchangedByConstructionOnly':
    'Loss per trade is unchanged by construction; only the exit distribution moved.',
  'research.markedCompleteWithAnInconclusiveToPromisingVerdictAn':
    'Marked complete with an inconclusive-to-promising verdict and the confidence caveat attached.',
  'research.meanOutcomeInRiskUnits': 'mean outcome in risk units',
  'research.meanReversionAtTheRangeEdgeAbandoned': 'Mean reversion at the range edge (abandoned)',
  'research.method': 'Method',
  'research.methodNote':
    'Metrics are produced by deterministic code over a fixed data set, never by the model. A rule cannot become active until an evaluation exists and a human has approved it.',
  'research.metrics': 'Metrics',
  'research.misleadingOnItsOwn': 'misleading on its own',
  'research.missingMeansMissing': 'Missing means missing',
  'research.n': 'n =',
  'research.neverEditedInPlace': 'Never edited in place',
  'research.noBacktestEngineInThisPhase': 'No backtest engine in this phase',
  'research.noEvaluation': 'no evaluation',
  'research.noEvaluationAttached': 'No evaluation attached',
  'research.noEvaluationAttachedYetSoNo': 'No evaluation attached yet, so no metrics are shown.',
  'research.noModelAuthoredTextIsIncluded':
    'No model-authored text is included in a report. Sections are assembled from evaluation rows and rubric references.',
  'research.noModelText': 'No model text',
  'research.noReportForThisExperiment': 'No report for this experiment',
  'research.nothingMeasuredYet': 'Nothing measured yet',
  'research.nothingRecordedYet': 'Nothing recorded yet',
  'research.open': 'open',
  'research.openExperiment': 'Open experiment',
  'research.openingVolatilityMakesSizingErrorsMoreLikelySo':
    'Opening volatility makes sizing errors more likely, so waiting 15 minutes lowers average R variance.',
  'research.partialEvaluationAt96TradesStillRunning':
    'Partial evaluation at 96 trades; still running.',
  'research.pendingDecisions': 'Pending decisions',
  'research.performanceMetrics': 'Performance metrics',
  'research.planned': 'planned',
  'research.postEarningsGapsThatHoldTheirOpeningRangeContinue':
    'Post-earnings gaps that hold their opening range continue more often than they fade.',
  'research.previewNotice':
    'Illustrative research data. The deterministic backtest engine is not built in this phase, so every metric below is a layout example with synthetic provenance — not a measured result.',
  'research.recordedWithARationale': 'Recorded with a rationale',
  'research.rejectionsAreKeptAnExperimentTuned':
    'Rejections are kept. An experiment tuned until it looks good is a worse outcome than one that was dropped.',
  'research.report': 'Report',
  'research.reportedFirst': 'Reported first',
  'research.reportsAreAssembledFromStoredEvaluation':
    'Reports are assembled from stored evaluation rows and rubric references. The model may explain a report, but it does not write the numbers into it.',
  'research.requestingApprovalWritesAPendingRecord':
    'Requesting approval writes a pending record; the decision names a decider and cannot be made by the requester.',
  'research.research': 'Research',
  'research.researchSections': 'Research sections',
  'research.riskFirstChecklistBeforeEntry': 'Risk-first checklist before entry',
  'research.riskFirstChecklistEvaluationSummary': 'Risk-first checklist — evaluation summary',
  'research.runningPlusAnythingWaitingOnA': 'Running, plus anything waiting on a decision',
  'research.sameVisualWeight': 'Same visual weight',
  'research.sample240WinRate465Average':
    'Sample 240 · win rate 46.5% · average R 0.32 · maximum drawdown −8.4R · confidence 62%. Win rate is reported because it is easy to misread: expectancy, not win rate, is what the evaluation is about.',
  'research.sampleSizeComesBeforeAnyRate':
    'Sample size comes before any rate on every surface, because a rate without its sample is a claim without its limits.',
  'research.sampleSizeIsReportedBeforeAny':
    'Sample size is reported before any rate, because a rate without it is a rumour.',
  'research.selectAnExperimentToInspectIt': 'Select an experiment to inspect it',
  'research.skipTheFirst15MinutesOfTheSession': 'Skip the first 15 minutes of the session',
  'research.statedNotHidden': 'Stated, not hidden',
  'research.stoppedWithTheReasonRecorded': 'Stopped with the reason recorded',
  'research.syntheticDataAndABelowBarConfidenceIntervalThis':
    'Synthetic data and a below-bar confidence interval. This report is a reason to design a better test, not a reason to change behaviour.',
  'research.theDataSetIsSyntheticSoTheNumbers':
    'The data set is synthetic, so the numbers describe the generator as much as the checklist. Confidence of 62% is below the bar for promoting a rule. Nothing here has been out-of-sample tested.',
  'research.theOneLineEachExperimentCurrently': 'The one line each experiment currently supports',
  'research.theRuleStaysInactiveUntilThen': '. The rule stays inactive until then.',
  'research.totalAcrossEvaluationsWithMetrics': 'Total across evaluations with metrics',
  'research.tradesAcrossEveryEvaluationThatProduced':
    'trades across every evaluation that produced metrics ·',
  'research.tradesInTheEvaluationSet': 'trades in the evaluation set',
  'research.updated': '· updated',
  'research.waitingOnAHumanDecisionTheRule':
    'Waiting on a human decision — the rule stays inactive until one is recorded.',
  'research.waitingOnARecordedHumanDecision': 'Waiting on a recorded human decision',
  'research.whatThisExperimentCurrentlySupportsAnd':
    'What this experiment currently supports, and what it does not',
  'research.wideningTheInvalidationLevelWhileHoldingTheRisk':
    'Widening the invalidation level while holding the risk budget constant reduces noise-driven exits without increasing loss per trade.',
  'research.widerInvalidationLevelWithProportionallySmallerSize':
    'Wider invalidation level with proportionally smaller size',
  'research.winRateIsNotEdge': 'Win rate is not edge',
  'research.worstPeakToTroughExcursion': 'worst peak-to-trough excursion',
  'research.writingTheRiskBudgetAndInvalidationLevelBefore':
    'Writing the risk budget and invalidation level before considering reward reduces avoidable sizing errors.',
  // researchCard ────────────────────────────────────────────────
  'researchCard.noResearchServiceIsConnectedInThisPhase':
    'No research service is connected in this phase, so this action is inert.',
  // researchPage ────────────────────────────────────────────────
  'researchPage.aCompletedExperimentIsAFinishedMeasurementNot':
    'A completed experiment is a finished measurement, not an adopted rule.',
  'researchPage.choosingACardShowsItsEvaluationMetricsFindings':
    'Choosing a card shows its evaluation metrics, findings and provenance. The preview ships five experiments, including one abandoned on purpose.',
  'researchPage.eachCardStatesItsHypothesisBeforeItsNumbers':
    'Each card states its hypothesis before its numbers.',
  'researchPage.experiments': 'Experiments',
  'researchPage.experimentsEvaluated': 'Experiments evaluated',
  'researchPage.experimentsThatTestAProposedRuleAgainstEvidence':
    'Experiments that test a proposed rule against evidence. Metrics come from deterministic code over a fixed data set; a rule cannot become active without a recorded human approval.',
  'researchPage.timeline': 'Timeline',
  // retryState ──────────────────────────────────────────────────
  'retryState.gaveUp': 'Gave up',
  'retryState.retrying': 'Retrying',
  // riskSummary ─────────────────────────────────────────────────
  'riskSummary.fees': 'Fees',
  'riskSummary.invalidation': 'Invalidation',
  'riskSummary.plannedAndActualValuesForEachMeasure': 'Planned and actual values for each measure',
  'riskSummary.positionSize': 'Position size',
  'riskSummary.rewardToRisk': 'Reward-to-risk',
  'riskSummary.riskAmount': 'Risk amount',
  // safetyDialog ────────────────────────────────────────────────
  'safetyDialog.aProposedRuleCannotActivateWithoutAnEvaluation':
    'A proposed rule cannot activate without an evaluation and a recorded human approval. The requester cannot approve their own proposal.',
  'safetyDialog.deterministicMathOwnsEveryNumber': 'Deterministic math owns every number',
  'safetyDialog.epistemicLabelsOnEveryStatement': 'Epistemic labels on every statement',
  'safetyDialog.factAnalysisHypothesisAndUncertaintyAreRenderedExpli':
    'Fact, analysis, hypothesis and uncertainty are rendered explicitly, and unverified memory enters context as uncertainty — never as fact.',
  'safetyDialog.humanApprovalForAnythingThatChangesRules':
    'Human approval for anything that changes rules',
  'safetyDialog.noLiveTradingAndNoBrokerExecution': 'No live trading and no broker execution',
  'safetyDialog.noOperationIdToolJobKindOrConfiguration':
    'No operation id, tool, job kind or configuration key exists for either. The safety flags are typed as literal false, so no value can switch them on.',
  'safetyDialog.positionSizingRMultiplesAndRiskMetricsComeFrom':
    'Position sizing, R-multiples and risk metrics come from typed tools with tests. The model explains; it never computes a risk figure.',
  'safetyDialog.whatThisWorkstationIsAllowedToDoAnd':
    'What this workstation is allowed to do, and what it structurally cannot do.',
  // screenshotGallery ───────────────────────────────────────────
  'screenshotGallery.closeFullscreenAttachment': 'Close fullscreen attachment',
  'screenshotGallery.nextAttachment': 'Next attachment',
  'screenshotGallery.openAttachmentFullscreen': 'Open attachment fullscreen',
  'screenshotGallery.pressEscapeOrUseCloseToReturnTo':
    'Press Escape or use Close to return to the gallery. Arrow controls move between attachments.',
  'screenshotGallery.previousAttachment': 'Previous attachment',
  // session ─────────────────────────────────────────────────────
  'session.theDesktopShellDidNotAnswerWithAn':
    'The desktop shell did not answer with an API endpoint. The local service may still be starting.',
  'session.thisPageIsRunningInABrowserSo':
    'This page is running in a browser, so there is no local sidecar to stream from and no keychain to hold a session.',
  'session.vITEMTAPIURLIsSetButVITEMTSESSIONTOKENIsNot':
    'VITE_MT_API_URL is set but VITE_MT_SESSION_TOKEN is not.',
  // settings ────────────────────────────────────────────────────
  'settings.advanced': 'Advanced',
  'settings.aiProviders': 'AI providers',
  'settings.appearance': 'Appearance',
  'settings.backgroundJobs': 'Background jobs',
  'settings.budget': 'Budget',
  'settings.chartsAndNumericReadoutsStayLTR':
    'Charts and numeric readouts stay LTR on purpose: financial time series are read left-to-right.',
  'settings.comfortable': 'Comfortable',
  'settings.compact': 'Compact',
  'settings.configuration': 'Configuration',
  'settings.configurationStoresReferencesSuchAsKeychain':
    'Configuration stores references such as keychain:llm.openai, never key values.',
  'settings.dataProvenancePolicy': 'Data provenance policy',
  'settings.dataSafety': 'Data & safety',
  'settings.density': 'Density',
  'settings.directionAutomatic': 'Automatic (follow the language)',
  'settings.directionFollowsTheLanguage':
    'Automatic mirrors the interface when the language is right-to-left. The choice below it pins one direction whatever the language is.',
  'settings.desktopFirstTheLayoutTargets1280px':
    'Desktop-first: the layout targets 1280px and above and reflows below.',
  'settings.desktopHost': 'Desktop host',
  'settings.enforcedInCodeAndCoveredBy': 'Enforced in code and covered by tests, not a setting',
  'settings.historicalDataIsStatedAsHistorical':
    'Historical data is stated as historical; live data is not permitted in training.',
  'settings.howMuchOfTheWorkspaceIs': 'How much of the workspace is used by chrome',
  'settings.interfaceStatesAllThree': 'Interface states, all three',
  'settings.language': 'Language',
  'settings.languageAutomatic': 'Automatic',
  'settings.languageAutomaticCaption':
    'Persian and English are both read from the message you send, and the answer follows it. Technical terms stay as they are written in either language.',
  'settings.languageChosen':
    '{language} is chosen, so the answer stays in it whatever the message is written in, and this interface is shown in it.',
  'settings.languageEnglish': 'English',
  'settings.languageNotStorable':
    ' This session has no writable setting store, so the choice lasts until the app closes.',
  'settings.languagePersian': 'Persian (فارسی)',
  'settings.leftToRight': 'Left to right',
  'settings.localData': 'Local data',
  'settings.logsRedactCredentialsRecursivelyBeforeAnything':
    'Logs redact credentials recursively before anything is written.',
  'settings.modelProviders': 'Model providers',
  'settings.nothingIsStoredInABrowser':
    'Nothing is stored in a browser or sent anywhere in this phase.',
  'settings.providerSpecificCodeLivesOnlyIn':
    'Provider-specific code lives only in the adapter layer',
  'settings.queueStatesTheDurableWorkerLoop':
    'Queue states. The durable worker loop exists; the Activity page reads the real queue whenever a session is available, and shows these fixtures only when it is not.',
  'settings.rightToLeft': 'Right to left',
  'settings.sampleRows': 'sample rows',
  'settings.secrets': 'Secrets',
  'settings.settings': 'Settings',
  'settings.settingsSections': 'Settings sections',
  'settings.syntheticTrainingDataMustBeLabelled':
    'Synthetic training data must be labelled wherever it appears.',
  'settings.theGatewayOwnsFallbackOrderRetries':
    'The gateway owns fallback order, retries, timeouts and budget refusal. A provider can fail without the permission model changing: the model may request a tool, never run one.',
  'settings.theLanguageTheAgentAnswersIn':
    'The language the agent answers in, and the language this interface is shown in. Automatic follows the language you write',
  'settings.theLayoutUsesLogicalPropertiesSo':
    'The layout uses logical properties, so mirroring needs no second stylesheet',
  'settings.theShellGrantsTheInterfaceNo':
    'The shell grants the interface no filesystem, path, shell or network permission. Every privileged action — the keychain, the cache, exports, the bundled API process — is a typed command implemented in Rust, and the allow-list is verified in CI.',
  'settings.theme': 'Theme',
  'settings.theseAreStartUpAssertionsNot':
    'These are start-up assertions, not preferences: the process refuses to start if any of them is ever switched on.',
  'settings.thisInterfaceNeverDisplaysASecret':
    'This interface never displays a secret, not even masked.',
  'settings.unverifiedMemoryEntersContextAsUncertainty':
    'Unverified memory enters context as uncertainty, never as fact.',
  'settings.writingDirection': 'Writing direction',
  // settingsPage ────────────────────────────────────────────────
  'settingsPage.aFailedReadReportsItsTypedCodeAnd':
    'A failed read reports its typed code, and a retry is offered only when retrying can succeed — never for a refused credential.',
  'settingsPage.aFreshInstallHasNoProvidersAndNo':
    'A fresh install has no providers and no stored references; that is a normal state and says so rather than showing an error.',
  'settingsPage.aPIVersion': 'API version',
  'settingsPage.aProtocolMismatchIsRefusedRatherThanGuessed':
    'A protocol mismatch is refused rather than guessed at.',
  'settingsPage.aSkeletonHoldsTheLayoutWhileSettingsAre':
    'A skeleton holds the layout while settings are read from disk or from the shell, so nothing jumps when they arrive.',
  'settingsPage.aStateIsOnlyShownWhenASurface':
    'A state is only shown when a surface can actually reach it; adding a fourth state here would mean adding a behaviour, not a picture.',
  'settingsPage.appearanceDirectionProvidersAndTheSafetyPostureOf':
    'Appearance, direction, providers and the safety posture of the workstation. Secrets live in the OS keychain — configuration holds references only.',
  'settingsPage.auditRetention': 'Audit retention',
  'settingsPage.authenticatedWebSocketLoopbackOnlyTheActivityPageOpe':
    'Authenticated WebSocket, loopback only. The Activity page opens it when a session exists.',
  'settingsPage.breakingChangesAddAVersion': 'Breaking changes add a version.',
  'settingsPage.configurationCouldNotBeRead': 'Configuration could not be read',
  'settingsPage.contentAddressedBlobs': 'Content-addressed blobs.',
  'settingsPage.credentialStore': 'Credential store',
  'settingsPage.danger': 'Danger',
  'settingsPage.database': 'Database',
  'settingsPage.everyDataSurfaceInThisWorkstationOwesYou':
    'Every data surface in this workstation owes you these three. They are the real components, shown empty: no placeholder number stands in for a value that has not been read.',
  'settingsPage.fileStorage': 'File storage',
  'settingsPage.info': 'Info',
  'settingsPage.keyEntryArrivesWithTheDesktopShellOS':
    'Key entry arrives with the desktop shell (OS keychain), not the web preview.',
  'settingsPage.lessonContentAndLastKnownStatusSurviveWithoutA':
    'Lesson content and last-known status survive without a network.',
  'settingsPage.localAPI': 'Local API',
  'settingsPage.modelDirectToolExecution': 'Model-direct tool execution',
  'settingsPage.noOperationToolJobKindOrConfigKey':
    'No operation, tool, job kind or config key exists for it.',
  'settingsPage.nothingConfiguredYet': 'Nothing configured yet',
  'settingsPage.offlineCache': 'Offline cache',
  'settingsPage.operatingMode': 'Operating mode',
  'settingsPage.readingConfiguration': 'Reading configuration',
  'settingsPage.realtimePath': 'Realtime path',
  'settingsPage.sQLiteWALMode': 'SQLite, WAL mode.',
  'settingsPage.shellProtocol': 'Shell protocol',
  'settingsPage.theBundledAPIBinds127001OnlyOnA':
    'The bundled API binds 127.0.0.1 only, on a fixed port, with a per-launch token.',
  'settingsPage.theSixThingsThisWorkstationCanSayBack':
    "The six things this workstation can say back — a report, a confirmation or a decision — and the transient form of the same message. The toasts are real: raise one and it appears with the tone's own lifetime.",
  'settingsPage.theTypeSystemHasNoTrueValueFor': 'The type system has no true value for this flag.',
  'settingsPage.toolExecutionAlwaysPassesThroughTheOrchestratorSPerm':
    "Tool execution always passes through the orchestrator's permission check.",
  'settingsPage.windowsCredentialManagerMacOSKeychainOrSecretService':
    'Windows Credential Manager, macOS Keychain or Secret Service. Never a file.',
  // shell ───────────────────────────────────────────────────────
  'shell.aboutThisPreview': 'About this preview',
  'shell.brokerExecution': 'Broker execution',
  'shell.disabled': 'disabled',
  'shell.group.learning': 'Learning',
  'shell.group.system': 'System',
  'shell.group.workspace': 'Workspace',
  'shell.later': 'later',
  'shell.liveTrading': 'Live trading',
  'shell.masterTradeTrainingWorkstationLiveTrading':
    'Master Trade · training workstation · live trading and broker execution are disabled by design · no order capability exists in this application',
  'shell.nav.academy.description': 'Curriculum and lessons across six months',
  'shell.nav.academy.label': 'Academy',
  'shell.nav.activity.description':
    'The live event stream and the background-task queue, with their provenance and their failures',
  'shell.nav.activity.label': 'Activity',
  'shell.nav.agent.description':
    'Ask questions; every answer carries its evidence and uncertainty label',
  'shell.nav.agent.label': 'AI Workspace',
  'shell.nav.dashboard.description': 'Training progress, study metrics and read-only charts',
  'shell.nav.dashboard.label': 'Dashboard',
  'shell.nav.evaluation.description':
    'Record what you decided and read what the recorded prices say happened — with what could not be measured named rather than filled — and the capability catalogue behind it',
  'shell.nav.evaluation.label': 'Evaluation',
  'shell.nav.exams.description': 'Assessments, rubric scoring and mistake review',
  'shell.nav.exams.label': 'Exams',
  'shell.nav.journal.description':
    'Record what you actually did: setups, risk, rule compliance, mistakes and the lesson taken from each trade',
  'shell.nav.journal.label': 'Journal',
  'shell.nav.lab.description': 'Review practice setups and deterministic risk math (read-only)',
  'shell.nav.lab.label': 'Trading Lab',
  'shell.nav.memory.description':
    'What the agent may use, with a source and a trust state for every claim',
  'shell.nav.memory.label': 'Memory',
  'shell.nav.portfolio.description':
    'Declare what you hold and read the deterministic valuation: allocation, cost basis, concentration and exposure, with every gap named rather than filled',
  'shell.nav.portfolio.label': 'Portfolio',
  'shell.nav.profile.description':
    'What you have declared about your trading, with a source and a freshness state for every field',
  'shell.nav.profile.label': 'Profile',
  'shell.nav.research.description':
    'Experiments that test a proposed rule against evidence; adoption needs approval',
  'shell.nav.research.label': 'Research',
  'shell.nav.settings.description': 'Appearance, direction, providers and safety status',
  'shell.nav.settings.label': 'Settings',
  'shell.nav.usage.description':
    'Your plan, credit allowance and what each capability costs — with the refusals stated rather than hidden',
  'shell.nav.usage.label': 'Usage',
  'shell.navPrimary': 'Primary',
  'shell.notWiredYet': 'Not wired yet',
  'shell.previewMockData': 'Preview · mock data',
  'shell.previewNotice': 'Interface preview — mock data only, no backend or AI connected.',
  'shell.previewSnapshot': 'Preview snapshot:',
  'shell.realInThisBuild': 'Real in this build',
  'shell.safety': 'Safety',
  'shell.safetyDetails': 'Safety details',
  'shell.safetyPosture': 'Safety posture',
  'shell.search': 'Search',
  'shell.searchArrivesWithTheAPILayer': 'Search arrives with the API layer in Phase 3.3',
  'shell.searchLessonsSessionsNotes': 'Search lessons, sessions, notes',
  'shell.skipToWorkspaceContent': 'Skip to workspace content',
  'shell.theseGuaranteesAreAssertedAtStart':
    'These guarantees are asserted at start-up and covered by tests; if any of them regressed, the build would fail before this interface could run.',
  'shell.training': 'Training',
  'shell.yes': 'yes',
  // sidebar ─────────────────────────────────────────────────────
  'sidebar.safetyLiveTradingAndBrokerExecutionDisabledBy':
    'Safety: live trading and broker execution disabled by design',
  'sidebar.safetyStatus': 'Safety status',
  // store ───────────────────────────────────────────────────────
  'store.aBacktestVerdictIsNeverARuleActivation': 'A backtest verdict is never a rule activation.',
  'store.noLiveEventStream': 'No live event stream',
  'store.noLocalAPISessionSoTheQueueCannot': 'No local API session, so the queue cannot be read.',
  'store.theJobCouldNotBeCancelled': 'The job could not be cancelled.',
  'store.theJobListCouldNotBeRead': 'The job list could not be read.',
  'store.theServerRefusedAnAction': 'The server refused an action',
  // subscriptionPlanCard ────────────────────────────────────────
  'subscriptionPlanCard.allowancesAreDeclaredInCodeAndServedAs':
    'Allowances are declared in code and served as data. Nothing here can be bought: there is no payment integration in this build.',
  'subscriptionPlanCard.everyDeclaredCapabilityByPlanWithItsPerPeriod':
    'Every declared capability, by plan, with its per-period limit and cost',
  // subscriptionStatusCard ──────────────────────────────────────
  'subscriptionStatusCard.noSubscriptionHasEverBeenStoredForThis':
    'No subscription has ever been stored for this account, so the free plan is being reported as a default rather than read back from a record.',
  // toast ───────────────────────────────────────────────────────
  'toast.dismissThisNotification': 'Dismiss this notification',
  // tokens ──────────────────────────────────────────────────────
  'tokens.aCardEdge': 'a card edge',
  'tokens.aFigureWithNoDirectionACountA': 'a figure with no direction: a count, a size, a duration',
  'tokens.aGainAPassAThingThatWent': 'a gain, a pass, a thing that went the way it was meant to',
  'tokens.aLossAFailAThingThatDid': 'a loss, a fail, a thing that did not',
  'tokens.aStrongEdge': 'a strong edge',
  'tokens.anOptionThatIsOfferedAndNotChosen': 'an option that is offered and not chosen',
  'tokens.annotationText': 'annotation text',
  'tokens.annotationTextInAWell': 'annotation text in a well',
  'tokens.annotationTextOnARaisedCard': 'annotation text on a raised card',
  'tokens.attentionIsDueAndNoOutcomeHasBeen':
    'attention is due, and no outcome has been recorded yet',
  'tokens.bodyTextOnACard': 'body text on a card',
  'tokens.bodyTextOnARaisedCard': 'body text on a raised card',
  'tokens.bodyTextOnThePage': 'body text on the page',
  'tokens.brandTextOnACard': 'brand text on a card',
  'tokens.contextProvenanceScopeAStatedLimitation':
    'context: provenance, scope, a stated limitation',
  'tokens.durationsAndEasingsComponentsMustHonorPrefersReduced':
    'Durations and easings; components must honor prefers-reduced-motion.',
  'tokens.inkOnAFilledAccentControl': 'ink on a filled accent control',
  'tokens.inkOnAFilledDestructiveControl': 'ink on a filled destructive control',
  'tokens.interfaceAndNumericFontStacksTheWeightedType':
    'Interface and numeric font stacks, the weighted type scale, and the weight ladder it draws on.',
  'tokens.layeringForShellChromeDropdownsModalsToastsAnd':
    'Layering for shell chrome, dropdowns, modals, toasts and tooltips.',
  'tokens.menusPopoversAndTheModalPanel': 'menus, popovers and the modal panel',
  'tokens.notOfferedInThisStateByPermissionOr':
    'not offered in this state, by permission or by plan — not broken',
  'tokens.phoneLandscape': 'phone landscape',
  'tokens.premiumDarkFintechThemeLightThemeDeferredTokens':
    'Premium dark fintech theme. Light theme deferred; tokens are semantic so it can be added without touching components.',
  'tokens.presentAndReadableButNotTheCurrentThing':
    'present and readable, but not the current thing',
  'tokens.radiiByTheKindOfSurfaceMarkInset':
    'Radii by the kind of surface: mark, inset tile, control, selectable tile, panel, pill.',
  'tokens.secondaryText': 'secondary text',
  'tokens.secondaryTextOnARaisedCard': 'secondary text on a raised card',
  'tokens.semanticSurfacesTextBordersStateColoursAndTheir':
    'Semantic surfaces, text, borders, state colours and their borders (plus provenance/epistemic colours).',
  'tokens.somethingThatWasAskedForCouldNotBe': 'something that was asked for could not be done',
  'tokens.theDefaultCard': 'the default card',
  'tokens.theFocusRing': 'the focus ring',
  'tokens.theOneAccentSurfaceOnAScreenThat':
    'the one accent surface on a screen that asks to be acted on',
  'tokens.theOptionTheReaderHasChosen': 'the option the reader has chosen',
  'tokens.theResponsiveLadderPhoneLandscapeTabletDesktopWide':
    'The responsive ladder: phone landscape, tablet, desktop, wide and ultrawide, in that order.',
  'tokens.theThingCurrentlyInViewOrTheOne':
    'the thing currently in view, or the one being acted on',
  'tokens.unavailableText': 'unavailable text',
  'tokens.wellsAndInsetsCodeLogTailsEmptyPanes': 'wells and insets: code, log tails, empty panes',
  // topbar ──────────────────────────────────────────────────────
  'topbar.notificationsAndBackgroundTasks': 'Notifications and background tasks',
  'topbar.switchToLeftToRightLayout': 'Switch to left-to-right layout',
  'topbar.switchToRightToLeftLayout': 'Switch to right-to-left layout',
  'topbar.toggleWritingDirection': 'Toggle writing direction',
  // tradeFilters ────────────────────────────────────────────────
  'tradeFilters.clearAllTradeFilters': 'Clear all trade filters',
  'tradeFilters.dateRange': 'Date range',
  'tradeFilters.direction': 'Direction',
  'tradeFilters.market': 'Market',
  'tradeFilters.result': 'Result',
  'tradeFilters.setup': 'Setup',
  'tradeFilters.status': 'Status',
  // tradeForm ───────────────────────────────────────────────────
  'tradeForm.aResultWithoutItsSetupCannotBeReviewed':
    'A result without its setup cannot be reviewed.',
  'tradeForm.aWrittenRecordIsAppendedToTheJournal':
    'A written record is appended to the journal; it never activates a rule and never reaches a broker.',
  'tradeForm.actualRRealised': 'Actual R realised',
  'tradeForm.attachments': 'Attachments',
  'tradeForm.cancelThisTradeRecord': 'Cancel this trade record',
  'tradeForm.changingThisReChecksTheLevelsInTheNext':
    'Changing this re-checks the levels in the next section.',
  'tradeForm.chooseASetup': 'Choose a setup…',
  'tradeForm.commaSeparatedEGASetupRunnerHeld': 'Comma separated, e.g. A+ setup, runner held.',
  'tradeForm.commission': 'Commission',
  'tradeForm.compliantEveryRuleFollowed': 'Compliant — every rule followed',
  'tradeForm.confluences': 'Confluences',
  'tradeForm.discardThisTradeRecord': 'Discard this trade record',
  'tradeForm.discipline': 'Discipline',
  'tradeForm.emotionalStateAfterExit': 'Emotional state after exit',
  'tradeForm.emotionalStateBeforeEntry': 'Emotional state before entry',
  'tradeForm.emotionalStateDuringTheTrade': 'Emotional state during the trade',
  'tradeForm.emptyWhileTheTradeIsOpen': 'Empty while the trade is open.',
  'tradeForm.entryConfirmation': 'Entry confirmation',
  'tradeForm.entryPrice': 'Entry price',
  'tradeForm.entryRationale': 'Entry rationale',
  'tradeForm.entryTime': 'Entry time',
  'tradeForm.executionAndRisk': 'Execution and risk',
  'tradeForm.exitPlan': 'Exit plan',
  'tradeForm.exitPrice': 'Exit price',
  'tradeForm.exitTime': 'Exit time',
  'tradeForm.fear': 'Fear',
  'tradeForm.futureAdjustment': 'Future adjustment',
  'tradeForm.greed': 'Greed',
  'tradeForm.hesitation': 'Hesitation',
  'tradeForm.higherTimeframeBias': 'Higher-timeframe bias',
  'tradeForm.improvementsToMake': 'Improvements to make',
  'tradeForm.impulsiveness': 'Impulsiveness',
  'tradeForm.invalidationCondition': 'Invalidation condition',
  'tradeForm.keepEditingThisRecord': 'Keep editing this record',
  'tradeForm.keyZone': 'Key zone',
  'tradeForm.leaveEmptyUntilTheTradeIsScored': 'Leave empty until the trade is scored.',
  'tradeForm.leaveEmptyWhileTheTradeIsOpen': 'Leave empty while the trade is open.',
  'tradeForm.leavingNowDropsEverythingEnteredOnThisForm':
    'Leaving now drops everything entered on this form. Nothing has been written to the journal.',
  'tradeForm.liquidityContext': 'Liquidity context',
  'tradeForm.mainLesson': 'Main lesson',
  'tradeForm.markTheItemsSatisfiedBeforeEntryAnUnmarked':
    'Mark the items satisfied before entry. An unmarked checklist is a blank, not a pass.',
  'tradeForm.marketContext': 'Market context',
  'tradeForm.newsExposure': 'News exposure',
  'tradeForm.notAssessedYet': 'Not assessed yet',
  'tradeForm.notes': 'Notes',
  'tradeForm.onePerLine': 'One per line.',
  'tradeForm.onePerLineTheseBecomeCountableTags': 'One per line. These become countable tags.',
  'tradeForm.partialAtLeastOneRuleMissed': 'Partial — at least one rule missed',
  'tradeForm.planCompliance': 'Plan compliance',
  'tradeForm.plannedManagement': 'Planned management',
  'tradeForm.plannedNotAchieved': 'Planned, not achieved.',
  'tradeForm.plannedRewardToRisk': 'Planned reward-to-risk',
  'tradeForm.plannedRiskAccountCurrency': 'Planned risk (account currency)',
  'tradeForm.reportingABreakHonestlyIsWorthMoreThan':
    'Reporting a break honestly is worth more than a clean-looking record.',
  'tradeForm.requiredWhatMakesThisTradeWrong': 'Required: what makes this trade wrong.',
  'tradeForm.ruleChecklist': 'Rule checklist',
  'tradeForm.saveThisRecordAsADraft': 'Save this record as a draft',
  'tradeForm.screenshotsAndMarkupsThatSupportTheRecord':
    'Screenshots and markups that support the record.',
  'tradeForm.selfReportedRecordedAtTheTimeRatherThanReconstructed':
    'Self-reported, recorded at the time rather than reconstructed afterwards.',
  'tradeForm.stopLossInvalidation': 'Stop loss / invalidation',
  'tradeForm.submitThisTradeRecord': 'Submit this trade record',
  'tradeForm.submittingValidatesTheRecordAndWritesItTo':
    'Submitting validates the record and writes it to the journal. It cannot place, change or close anything.',
  'tradeForm.symbol': 'Symbol',
  'tradeForm.tags': 'Tags',
  'tradeForm.takeProfit': 'Take profit',
  'tradeForm.theInstrumentAsYourPlatformNamesIt': 'The instrument as your platform names it.',
  'tradeForm.theLevelsAndTheRiskTheseMustAgree':
    'The levels and the risk. These must agree with the direction.',
  'tradeForm.thePlanWrittenBeforeEntryAndTheChecklist':
    'The plan written before entry, and the checklist it was measured against.',
  'tradeForm.theTimeframeTheSetupWasReadOn': 'The timeframe the setup was read on.',
  'tradeForm.timeframe': 'Timeframe',
  'tradeForm.tradeDate': 'Trade date',
  'tradeForm.tradeInformation': 'Trade information',
  'tradeForm.tradeStatus': 'Trade status',
  'tradeForm.tradeThesis': 'Trade thesis',
  'tradeForm.tradingPlan': 'Trading plan',
  'tradeForm.tradingSession': 'Trading session',
  'tradeForm.volatilityConditions': 'Volatility conditions',
  'tradeForm.whatItTaughtARecordWithNoReview':
    'What it taught. A record with no review cannot be studied.',
  'tradeForm.whatTheChartLookedLikeBeforeTheEntry': 'What the chart looked like before the entry.',
  'tradeForm.whatWasTradedWhenAndFromWhichSetup': 'What was traded, when, and from which setup.',
  'tradeForm.whatWentWell': 'What went well',
  // tradeRow ────────────────────────────────────────────────────
  'tradeRow.actions': 'Actions',
  'tradeRow.actualR': 'Actual R',
  'tradeRow.addReview': 'Add review',
  'tradeRow.dateTime': 'Date / time',
  'tradeRow.deleteRecord': 'Delete record',
  'tradeRow.duplicateAsTemplate': 'Duplicate as template',
  'tradeRow.editRecord': 'Edit record',
  'tradeRow.planRR': 'Plan R:R',
  'tradeRow.risk': 'Risk',
  'tradeRow.stop': 'Stop',
  'tradeRow.target': 'Target',
  'tradeRow.thisRecordIsAlreadyArchived': 'This record is already archived.',
  'tradeRow.trade': 'Trade',
  'tradeRow.viewDetails': 'View details',
  // tradeTable ──────────────────────────────────────────────────
  'tradeTable.clearFilters': 'Clear filters',
  'tradeTable.exportIsNotConnectedInThisPhaseNo':
    'Export is not connected in this phase: no file is written.',
  'tradeTable.exportTheCurrentView': 'Export the current view',
  'tradeTable.journalRecordsAreBeingReadForThisView':
    'Journal records are being read for this view.',
  'tradeTable.nextPageOfTrades': 'Next page of trades',
  'tradeTable.previousPageOfTrades': 'Previous page of trades',
  'tradeTable.readingTrades': 'Reading trades',
  'tradeTable.restoreDefaultColumns': 'Restore default columns',
  'tradeTable.showEveryColumn': 'Show every column',
  'tradeTable.tradeHistoryWithDateSymbolDirectionSetupRisk':
    'Trade history with date, symbol, direction, setup, risk, realised R, result, rule compliance and status. Each row has a menu of record actions.',
  // tradingLabPage ──────────────────────────────────────────────
  'tradingLabPage.aPendingToolShowsTheToolSNameAnd':
    "A pending tool shows the tool's name and inputs, never a provisional number — a number that later changes is worse than a spinner.",
  'tradingLabPage.aRefusalOrAFailureIsShownWith':
    'A refusal or a failure is shown with its typed code: a denied operation and an unavailable tool are different answers and must not read the same.',
  'tradingLabPage.aToolCallIsARoundTripThese':
    'A tool call is a round trip. These are the two states that follow it; the empty pre-call state is the panel above.',
  'tradingLabPage.aTrainingSurfaceForReviewingPracticeSetupsAnd':
    'A training surface for reviewing practice setups and risk math. Read-only: there is no order entry, no broker connection and no execution path anywhere in this application.',
  'tradingLabPage.approvalWorkflowLandsWithThePersistenceSliceThe':
    'Approval workflow lands with the persistence slice; the gate is already enforced in the backend.',
  'tradingLabPage.noButtonOnThisPageCanArmAnything':
    'No button on this page can arm anything: the application has no order path, so a risk figure can only ever inform a study decision.',
  'tradingLabPage.noExecutionCapabilityExistsInTheSystemSo':
    'No execution capability exists in the system, so nothing here can be armed.',
  'tradingLabPage.practiceAccountBalance': 'Practice account balance',
  'tradingLabPage.riskMath': 'Risk math',
  'tradingLabPage.riskPerTrade': 'Risk per trade (%)',
  'tradingLabPage.runningTheDeterministicTool': 'Running the deterministic tool',
  'tradingLabPage.setupReview': 'Setup review',
  'tradingLabPage.theRiskToolsExistInTheBackendAnd':
    'The risk tools exist in the backend and are covered by tests, but the interface is not wired to them in this phase.',
  'tradingLabPage.theToolCallFailed': 'The tool call failed',
  'tradingLabPage.theToolRegistryAndRiskMathAreImplemented':
    'The tool registry and risk math are implemented; this phase only ships the interface, so the panel is inert.',
  'tradingLabPage.whenWiredThePanelShowsTheToolName':
    'When wired, the panel shows the tool name, its inputs and a fact label — never a model-authored number.',
  // trend ───────────────────────────────────────────────────────
  'trend.notAvailable': 'not available',
  // ui ──────────────────────────────────────────────────────────
  'ui.closeDialog': 'Close dialog',
  'ui.epistemic.analysis': 'Interpretation built on the stated sources.',
  'ui.epistemic.fact': 'Taken from a verified source or a deterministic tool result.',
  'ui.epistemic.hypothesis': 'A testable claim that has not been verified.',
  'ui.epistemic.uncertainty': 'Known limits, missing evidence or an unresolved question.',
  'ui.live': 'live',
  'ui.notifications': 'Notifications',
  'ui.raise': 'Raise',
  'ui.readOnly': 'Read-only',
  'ui.theSameComponentWithALifetime':
    "The same component with a lifetime. Hover or focus one and it stops counting down; each tone's default duration is its own, and a destructive prompt has none because it is waiting for a decision. The card itself is the exhibit's accent emphasis: the one surface on a screen that asks to be acted on, drawn here rather than described.",
  'ui.toastsOnTheAccentCard': 'Toasts — on the accent card',
  // usage ───────────────────────────────────────────────────────
  'usage.aPlanNeverGrantsAnOperation':
    'A plan never grants an operation your role denies, so this cannot be resolved by upgrading.',
  'usage.allowance': 'allowance',
  'usage.attemptStatus.refused': 'Refused before it ran — nothing was charged',
  'usage.attemptStatus.released': 'Completed nothing — returned',
  'usage.attemptStatus.reserved': 'Held',
  'usage.attemptStatus.settled': 'Completed and charged',
  'usage.balance': 'balance',
  'usage.capability': 'Capability',
  'usage.capabilitySUnaffordableNow': 'capability(s) unaffordable now',
  'usage.category': 'Category',
  'usage.consumed': 'consumed',
  'usage.consumptionThisPeriod': 'Consumption this period',
  'usage.couldNotReadUsage': 'Could not read usage',
  'usage.couldNotReadUsageHistory': 'Could not read usage history',
  'usage.countedFromTheLedgerRatherThan':
    'Counted from the ledger rather than from a stored counter, so a corrected charge cannot leave the count wrong.',
  'usage.credits': 'credits',
  'usage.creditsLeft': 'credits left',
  'usage.creditsPerInvocationOnceItExists': 'credits per invocation once it exists.',
  'usage.creditsPerPeriod': 'Credits per period',
  'usage.current': 'Current',
  'usage.declaredCapabilities': 'Declared capabilities',
  'usage.defaultNotRecorded': 'Default, not recorded',
  'usage.description':
    'Your plan, your credit allowance, what each capability costs and what has actually been consumed.',
  'usage.everyCapabilityThePlatformDeclaresWhether':
    'Every capability the platform declares, whether or not it exists yet. A capability that is not built and one that is not in your plan are different answers, and they are never shown with the same words.',
  'usage.everyInvocationIncludingTheOnesThat':
    'Every invocation, including the ones that were refused before running and the ones that cost nothing.',
  'usage.expired': 'expired',
  'usage.granted': 'granted',
  'usage.includedNoSeparateCap': 'included, no separate cap',
  'usage.ledgerKind.adjustment': 'Adjustment',
  'usage.ledgerKind.consume': 'Credit held',
  'usage.ledgerKind.expire': 'Allowance expired',
  'usage.ledgerKind.grant': 'Allowance granted',
  'usage.ledgerKind.refund': 'Credit returned',
  'usage.ledgerStatus.released': 'Returned — the work did not complete',
  'usage.ledgerStatus.reserved': 'Held until the work finishes',
  'usage.ledgerStatus.settled': 'Final',
  'usage.movements': 'Movements',
  'usage.noAttemptsYet': 'No attempts yet',
  'usage.noCapabilityIsCappedSeparatelyBy': 'No capability is capped separately by this plan',
  'usage.noHistoryToShow': 'No history to show',
  'usage.noMovementsYet': 'No movements yet',
  'usage.noUsageToShow': 'No usage to show',
  'usage.notEnoughCredits': 'Not enough credits',
  'usage.notInThisPlan': 'Not in this plan',
  'usage.notIncluded': 'not included',
  'usage.notLimitedSeparatelyByThisPlan':
    'Not limited separately by this plan; the balance is the only cap.',
  'usage.notPermittedForYourRole': 'Not permitted for your role',
  'usage.nothingHereCanTakeAPayment':
    'Nothing here can take a payment: this build has no payment integration, and every plan is declared as not purchasable.',
  'usage.oneCreditIsOneAgentTurn':
    'One credit is one agent turn. Every number below is computed on the server from your stored plan and your own ledger.',
  'usage.perPeriod': 'per period',
  'usage.plans': 'Plans',
  'usage.priceNotOfferedThisBuildHas':
    'Price: not offered. This build has no payment integration, so this plan is not purchasable and no amount is displayed.',
  'usage.retired': 'Retired',
  'usage.returned': 'Returned',
  'usage.returned2': 'returned',
  'usage.thatIsAGapInThe':
    'That is a gap in the product, not in your entitlement — the declared cost is',
  'usage.theAllowanceIsABudgetFor':
    'The allowance is a budget for the period rather than a balance that accumulates, and the deterministic capabilities keep working with a spent allowance.',
  'usage.theAllowanceRenewsAt': 'The allowance renews at',
  'usage.thisBuildHasNoPaymentIntegration':
    'This build has no payment integration, so no plan is purchasable and no price is shown. A change of plan is recorded only as an administrative grant, with the decision on file.',
  'usage.thisDeploymentReportsA': 'This deployment reports a',
  'usage.thisPeriod': 'this period',
  'usage.tryAgain': 'Try again',
  'usage.usageCredits': 'Usage credits',
  'usage.usageHistory': 'Usage history',
  'usage.usageHistoryHasNotBeenRequested': 'Usage history has not been requested yet',
  'usage.usageSections': 'Usage sections',
  'usage.usageStoreBalancesAndHistoryAre':
    'usage store: balances and history are not durable here, so a restart resets them. The capability itself still meters.',
  'usage.usedSinceTheAccountWasCreated': 'used since the account was created',
  'usage.usedThisPeriod': 'used this period',
  'usage.whatEachCostMeans': 'What each cost means',
  'usage.whatThisPlanMayNotDo': 'What this plan may not do',
  'usage.yourPlan': 'Your plan',
  // usageCreditsCard ────────────────────────────────────────────
  'usageCreditsCard.thisPeriod': 'This period',
  // usageHistory ────────────────────────────────────────────────
  'usageHistory.noMeteredCapabilityHasBeenInvokedOnThis':
    'No metered capability has been invoked on this account.',
  'usageHistory.nothingHasBeenGrantedHeldReturnedOrAdjusted':
    'Nothing has been granted, held, returned or adjusted on this account.',
  'usageHistory.theFirstAgentTurnOfThePeriodGrants':
    'The first agent turn of the period grants the allowance, so this fills in as soon as anything metered runs.',
  // usagePage ───────────────────────────────────────────────────
  'usagePage.allowancesAddedIncludingThePeriodGrant':
    'Allowances added, including the period grant',
  'usagePage.consumed': 'Consumed',
  'usagePage.creditsGivenBackWhenWorkDidNotComplete':
    'Credits given back when work did not complete',
  'usagePage.creditsKeptForCompletedWork': 'Credits kept for completed work',
  'usagePage.expired': 'Expired',
  'usagePage.granted': 'Granted',
  'usagePage.noUsageStoreIsReachableFromThisSession':
    'No usage store is reachable from this session, so there is no ledger to read. Nothing is shown in its place.',
  'usagePage.openThisTabToReadTheMovementsAnd':
    'Open this tab to read the movements and attempts behind the balance.',
  'usagePage.theCreditBalanceIsTheOnlyLimitSo':
    'The credit balance is the only limit, so there is no per-capability usage to report.',
  'usagePage.unusedAllowanceAtTheEndOfAPeriod': 'Unused allowance at the end of a period',
} as const;

export type MessageKey = keyof typeof EN_MESSAGES;
