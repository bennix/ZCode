export async function mountWorkCoderFixture(locale) {
  await import("/packages/ui/src/styles.css");
  const { React, createRoot } = await import("/packages/ui/tests/studio-react-entry.js");
  const { ZCodeIntlProvider } = await import("/packages/ui/src/i18n/IntlProvider.tsx");
  const { TabStoreProvider } = await import("/packages/ui/src/store/TabStoreProvider.tsx");
  const { ServiceProvider } = await import("/packages/ui/src/hooks/useServices.tsx");
  const { PlatformProvider } = await import("/packages/ui/src/hooks/usePlatform.tsx");
  const { WorkCoderWorkspace } =
    await import("/packages/ui/src/v4/composer/workcoder/WorkCoderWorkspace.tsx");
  const { ResearchProbePanel } =
    await import("/packages/ui/src/v4/composer/workcoder/ResearchProbePanel.tsx");
  const { useResearchProbe } = await import("/packages/ui/src/hooks/useResearchProbe.ts");
  const store = await import("/packages/ui/src/store/researchProbeStore.ts");
  globalThis.probes = store;
  globalThis.started = 0;
  globalThis.sent = [];
  globalThis.created = [];
  globalThis.agents = [];
  globalThis.saved = [];
  globalThis.failSend = true;
  globalThis.factListeners = [];
  const services = {
    hooksService: { loadHooks: async () => ({ hooks: [], hooksEnabled: false }) },
    fileService: {
      resolvePath: async ({ path }) => path,
      stat: async ({ path }) => ({ path, type: "directory" }),
    },
    modelSelectionService: {
      getView: async () =>
        globalThis.configuredView ?? globalThis.registryView ?? globalThis.fullView,
    },
    providerSettingsService: {
      addPersonalModel: async (providerId, modelId, config) => {
        globalThis.modelAdded = { providerId, modelId, config };
        globalThis.configuredView = {
          providers: globalThis.fullView.providers.map((provider) => ({
            ...provider,
            models: provider.models
              .filter((model) => model.modelId !== modelId)
              .concat([{ modelId, config }]),
          })),
        };
      },
    },
    subagentsService: {
      list: async () => ({ agents: globalThis.agents }),
      createAgent: async ({ config }) => {
        const agent = { ...config, scope: "workspace", enabled: true };
        globalThis.agents.push(agent);
        return { agent };
      },
    },
    zcodeTaskService: {
      createTask: async (input) => {
        globalThis.created.push(input);
        return { taskId: "test-workcoder-session" };
      },
      sendPrompt: async (input) => {
        globalThis.sent.push(input);
        if (globalThis.failSend) throw new Error("Simulated disconnect");
      },
    },
    zcodeAgentService: {
      onDynamicConversationTelemetryFact: () => (listener) => {
        globalThis.factListeners.push(listener);
        return {
          dispose: () => {
            globalThis.factListeners = globalThis.factListeners.filter((item) => item !== listener);
          },
        };
      },
    },
  };
  const models = [
    "anthropic/claude-sonnet-5.5",
    "anthropic/claude-haiku-5.5",
    "anthropic/claude-opus-5.5",
    "custom/alternate-model",
    "custom/high-only",
  ];
  const view = {
    providers: [
      {
        providerId: "synthetic",
        models: models.map((modelId) => ({
          modelId,
          config: {
            optionSpecs: {
              reasoningLevel: {
                values:
                  modelId === "custom/high-only"
                    ? ["high"]
                    : modelId === "anthropic/claude-haiku-5.5"
                      ? ["none"]
                      : ["low", "medium", "high"],
              },
            },
          },
        })),
      },
    ],
  };
  view.providers.push({
    providerId: "alternate",
    models: [
      {
        modelId: "custom/alternate-model",
        config: { optionSpecs: { reasoningLevel: { values: ["medium"] } } },
      },
    ],
  });
  globalThis.fullView = view;
  function Content() {
    const [catalog, setCatalog] = React.useState(view);
    globalThis.setCatalog = setCatalog;
    globalThis.registryView = catalog;
    useResearchProbe("/synthetic");
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(WorkCoderWorkspace, {
        workspacePath: "/synthetic",
        modelSelectionView: catalog,
        onStarted: () => {
          globalThis.started++;
        },
      }),
      React.createElement(ResearchProbePanel, { scope: "/synthetic" }),
    );
  }
  document.body.innerHTML =
    '<main id="app" style="max-width:960px;margin:auto;padding:8px"></main>';
  createRoot(document.getElementById("app")).render(
    React.createElement(
      ZCodeIntlProvider,
      { initialLocale: locale },
      React.createElement(
        ServiceProvider,
        { services },
        React.createElement(
          PlatformProvider,
          {
            platform: {
              isDesktopRuntime: true,
              selectDirectory: async () => globalThis.pickDirectory ?? null,
              saveFile: async (input) => {
                globalThis.saved.push({
                  name: input.suggestedName,
                  text: new TextDecoder().decode(input.data),
                });
                return { success: true };
              },
            },
          },
          React.createElement(TabStoreProvider, null, React.createElement(Content)),
        ),
      ),
    ),
  );
}
