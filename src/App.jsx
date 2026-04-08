import useMonitorApp from "./app/useMonitorApp";
import ApiFormModal from "./components/ApiFormModal";
import ConfirmDeleteModal from "./components/ConfirmDeleteModal";
import EventPanel from "./components/EventPanel";
import GistSyncModal from "./components/GistSyncModal";
import MonitorHero from "./components/MonitorHero";
import NetworkStatusBanner from "./components/NetworkStatusBanner";
import RelayPanel from "./components/RelayPanel";
import RestoreGistModal from "./components/RestoreGistModal";
import StatusFloatWindow from "./components/StatusFloatWindow";
import TopToast from "./components/TopToast";

export default function App() {
  const monitorApp = useMonitorApp();
  const currentHash = window.location.hash || "";
  const isStatusFloatWindow =
    currentHash.startsWith("#/status-float") ||
    currentHash.startsWith("#status-float");
  const statusFloatApiId = new URLSearchParams(currentHash.split("?")[1] || "").get("apiId");
  const statusFloatApi = monitorApp.apis.find((api) => api.id === statusFloatApiId);

  if (isStatusFloatWindow) {
    return <StatusFloatWindow api={statusFloatApi} />;
  }

  return (
    <div className="shell">
      <TopToast flash={monitorApp.flash} />
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <MonitorHero
        intervalSeconds={monitorApp.intervalSeconds}
        isRunning={monitorApp.isRunning}
        lastRunAt={monitorApp.lastRunAt}
        monitorMode={monitorApp.monitorMode}
        monitorBusy={monitorApp.monitorBusy}
        onMonitorModeChange={monitorApp.handleMonitorModeChange}
        onIntervalChange={monitorApp.setIntervalSeconds}
        onManualCheck={monitorApp.handleManualCheck}
        onToggleMonitoring={monitorApp.handleToggleMonitoring}
        stats={monitorApp.stats}
      />

      <NetworkStatusBanner
        networkCheckURL={monitorApp.networkCheckURL}
        networkStatus={monitorApp.networkStatus}
        onRefresh={monitorApp.handleRefreshNetworkStatus}
      />

      <main className="dashboard">
        <RelayPanel
          apis={monitorApp.apis}
          focusedApis={monitorApp.focusedApis}
          intervalSeconds={monitorApp.intervalSeconds}
          listBusy={monitorApp.listBusy}
          monitorMode={monitorApp.monitorMode}
          modelFilters={monitorApp.modelFilters}
          now={monitorApp.now}
          onAddApi={monitorApp.handleOpenAddApi}
          onClearHistory={monitorApp.handleClearHistory}
          onConfigureSync={monitorApp.handleOpenGistSync}
          onCopyAccountName={monitorApp.handleCopyAccountName}
          onCopyAccountPassword={monitorApp.handleCopyAccountPassword}
          onCopyApiKey={monitorApp.handleCopyApiKey}
          onDeleteRequest={monitorApp.handleDeleteRequest}
          onEdit={monitorApp.handleEdit}
          onApplyApiConfig={monitorApp.handleApplyApiConfig}
          onOpenWebsite={monitorApp.handleOpenWebsite}
          onToggleStatusFloat={monitorApp.handleToggleStatusFloat}
          onSingleCheck={monitorApp.handleSingleCheck}
          onTogglePause={monitorApp.handleTogglePause}
          onToggleModel={monitorApp.handleToggleModel}
          openStatusFloatApiIds={monitorApp.statusFloat.openApiIds}
          selectedModelSet={monitorApp.selectedModelSet}
          unfocusedApis={monitorApp.unfocusedApis}
        />

        <EventPanel events={monitorApp.events} />
      </main>

      <ApiFormModal
        form={monitorApp.form}
        formBusy={monitorApp.formBusy}
        open={monitorApp.isApiFormOpen}
        onCancel={monitorApp.handleCancelEdit}
        onSubmit={monitorApp.handleSubmit}
        onUpdateForm={monitorApp.updateForm}
      />

      <GistSyncModal
        gistSync={monitorApp.gistSync}
        hasConfiguredGistSync={monitorApp.hasConfiguredGistSync}
        listBusy={monitorApp.listBusy}
        open={monitorApp.isGistSyncOpen}
        onCancel={monitorApp.handleCloseGistSync}
        onCopyGistId={monitorApp.handleCopyGistId}
        onRestoreFromGist={monitorApp.handleRestoreFromGist}
        onSyncToGist={monitorApp.handleSyncToGist}
        onUpdateGistSync={monitorApp.updateGistSync}
      />

      <ConfirmDeleteModal
        listBusy={monitorApp.listBusy}
        pendingDeleteApi={monitorApp.pendingDeleteApi}
        onCancel={monitorApp.handleDeleteCancel}
        onConfirm={monitorApp.handleDeleteConfirm}
      />

      <RestoreGistModal
        listBusy={monitorApp.listBusy}
        pendingRestoreChoice={monitorApp.pendingRestoreChoice}
        onCancel={monitorApp.handleRestoreChoiceCancel}
        onMerge={monitorApp.handleRestoreMergeConfirm}
        onOverwrite={monitorApp.handleRestoreOverwriteConfirm}
      />

      {monitorApp.statusFloat.openApiIds.length ? (
        <button
          className="close-float-button"
          type="button"
          onClick={() => monitorApp.handleCloseStatusFloat()}
        >
          关闭浮窗
        </button>
      ) : null}
    </div>
  );
}
