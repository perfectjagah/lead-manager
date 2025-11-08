// src/components/KanbanBoard.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "react-beautiful-dnd";
import { Typography, Spin, message, Button } from "antd";
import { LeadCard } from "./LeadCard";
import {
  fetchLeads,
  updateLeadStatus,
  fetchStatuses,
  fetchLeadsByStatus,
} from "../services/api";
import { Lead } from "../types";
import "./KanbanBoard.css";

const { Title } = Typography;

interface KanbanBoardProps {
  onLeadClick: (lead: Lead) => void;
  userRole: "Admin" | "SalesTeam";
  userId: string;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  onLeadClick,
  userRole,
  userId,
}) => {
  // leadsByStatus stores loaded pages per status
  const [leadsByStatus, setLeadsByStatus] = useState<Record<string, Lead[]>>(
    {}
  );
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<any[]>([]);
  // page size used for paginated requests
  const PAGE_SIZE = 10;

  // track which pages have been fetched per status (1-based pages)
  const [pagesFetched, setPagesFetched] = useState<Record<string, number[]>>(
    {}
  );
  const [loadingMore, setLoadingMore] = useState<Record<string, boolean>>({});
  const loadTimers = useRef<Record<string, number | null>>({});

  const loadLeads = async () => {
    setLoading(true);
    try {
      // We still call the bulk endpoints for compatibility, but we'll drive rendering from per-status paged calls
      const [response, statusesResp] = await Promise.all([
        fetchLeads(),
        fetchStatuses(),
      ]);

      if (statusesResp.success && statusesResp.data) {
        const s = statusesResp.data as any[];
        setStatuses(s);
        // initialize empty buckets and totals
        const initBuckets: Record<string, Lead[]> = {};
        const initTotals: Record<string, number> = {};
        s.forEach((st) => {
          initBuckets[String(st.id)] = [];
          initTotals[String(st.id)] = 0;
        });
        setLeadsByStatus(initBuckets);
        setTotals(initTotals);

        // Load first page for each status in parallel
        await Promise.all(
          s.map(async (st) => {
            try {
              const res = await fetchLeadsByStatus(
                String(st.id),
                PAGE_SIZE,
                0,
                userRole === "SalesTeam" ? userId : undefined
              );
              if (res.success && res.data) {
                const d = res.data as any;
                // Defensive filter: only accept leads that explicitly belong to this status.
                const incoming: Lead[] = (d.leads || []).filter(
                  (l: Lead) => String(l.statusId) === String(st.id)
                );
                // ensure newest leads appear first
                const sortByCreatedDesc = (arr: Lead[]) =>
                  [...arr].sort(
                    (a, b) =>
                      (new Date(b.createdAt).getTime() || 0) -
                      (new Date(a.createdAt).getTime() || 0)
                  );

                setLeadsByStatus((prev) => ({
                  ...prev,
                  [String(st.id)]: sortByCreatedDesc(incoming),
                }));
                setTotals((tprev) => ({
                  ...tprev,
                  [String(st.id)]:
                    typeof d.total === "number"
                      ? d.total
                      : incoming
                      ? incoming.length
                      : 0,
                }));
                // mark page 1 as fetched for this status
                setPagesFetched((p) => ({
                  ...p,
                  [String(st.id)]: [...(p[String(st.id)] || []), 1],
                }));
                setLoadingMore((l) => ({ ...l, [String(st.id)]: false }));
              }
            } catch (err) {
              // individual status load failed — ignore here
            }
          })
        );
      }

      // response (bulk) may be used for fallback but we don't set a global leads array anymore
      if (!response.success) {
        message.error(response.error || "Failed to load leads");
      }
    } catch (error) {
      message.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, [userRole, userId]);

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;

    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    // find the lead in per-status buckets
    let lead: Lead | undefined;
    let oldStatusId: string | undefined = undefined;
    Object.entries(leadsByStatus).forEach(([sid, arr]) => {
      const found = arr.find((x) => x.id === draggableId);
      if (found) {
        lead = found;
        oldStatusId = sid;
      }
    });
    if (!lead || !oldStatusId) return;

    const newStatusId = destination.droppableId;

    // Optimistic update: remove from old status and insert into new status at destination.index
    setLeadsByStatus((prev) => {
      const copy: Record<string, Lead[]> = { ...prev };
      const src = Array.isArray(copy[oldStatusId!])
        ? [...copy[oldStatusId!]]
        : [];
      const dst = Array.isArray(copy[newStatusId])
        ? [...copy[newStatusId]]
        : [];
      const idx = src.findIndex((l) => l.id === draggableId);
      const movingLead: Lead =
        idx !== -1 ? src.splice(idx, 1)[0] : ({ ...(lead as any) } as Lead);
      movingLead.statusId = String(newStatusId);
      dst.splice(destination.index, 0, movingLead);
      copy[oldStatusId!] = src;
      copy[newStatusId] = dst;
      return copy;
    });

    // Update backend
    const response = await updateLeadStatus(draggableId, newStatusId);
    if (!response.success) {
      message.error(response.error || "Failed to update lead status");
      // revert by reloading first page for affected statuses
      try {
        const promises = [
          (async () => {
            const res = await fetchLeadsByStatus(
              oldStatusId!,
              PAGE_SIZE,
              0,
              userRole === "SalesTeam" ? userId : undefined
            );
            if (res.success && res.data) {
              const d = res.data as any;
              setLeadsByStatus((p) => ({
                ...p,
                [oldStatusId!]: d.leads || [],
              }));
              setTotals((t) => ({
                ...t,
                [oldStatusId!]:
                  typeof d.total === "number"
                    ? d.total
                    : d.leads
                    ? d.leads.length
                    : 0,
              }));
            }
          })(),
          (async () => {
            const res = await fetchLeadsByStatus(
              newStatusId,
              PAGE_SIZE,
              0,
              userRole === "SalesTeam" ? userId : undefined
            );
            if (res.success && res.data) {
              const d = res.data as any;
              setLeadsByStatus((p) => ({ ...p, [newStatusId]: d.leads || [] }));
              setTotals((t) => ({
                ...t,
                [newStatusId]:
                  typeof d.total === "number"
                    ? d.total
                    : d.leads
                    ? d.leads.length
                    : 0,
              }));
            }
          })(),
        ];
        await Promise.all(promises);
      } catch (err) {
        // ignore
      }
    } else {
      message.success("Lead status updated");
    }
  };

  if (loading) {
    return (
      <div className="kanban-loading">
        <Spin size="large" />
        <p style={{ marginTop: 16 }}>Loading leads...</p>
      </div>
    );
  }

  const getColumnLeads = (statusId: string) =>
    leadsByStatus[String(statusId)] || [];

  const loadMoreForStatus = async (statusId: string) => {
    const current = leadsByStatus[String(statusId)] || [];
    const already = current.length;
    const total = totals[String(statusId)] ?? Infinity;
    if (already >= total) return;

    // compute next page (1-based)
    const nextPage = Math.floor(already / PAGE_SIZE) + 1;
    const fetched = pagesFetched[String(statusId)] || [];
    if (fetched.includes(nextPage)) return; // already fetched

    // debounce rapid scroll calls
    try {
      if (loadTimers.current[String(statusId)]) {
        window.clearTimeout(loadTimers.current[String(statusId)] as number);
      }
    } catch {}
    loadTimers.current[String(statusId)] = window.setTimeout(async () => {
      setLoadingMore((l) => ({ ...l, [String(statusId)]: true }));
      try {
        const offset = nextPage === 1 ? 0 : nextPage * PAGE_SIZE - PAGE_SIZE;
        const res = await fetchLeadsByStatus(
          String(statusId),
          PAGE_SIZE,
          offset,
          userRole === "SalesTeam" ? userId : undefined
        );
        if (res.success && res.data) {
          const d = res.data as any;
          // Defensive filter for appended page
          const incomingPage: Lead[] = (d.leads || []).filter(
            (l: Lead) => String(l.statusId) === String(statusId)
          );
          setLeadsByStatus((prev) => {
            const existing = prev[String(statusId)] || [];
            const merged = [...existing, ...incomingPage];
            // sort newest first
            const sorted = merged.sort(
              (a, b) =>
                (new Date(b.createdAt).getTime() || 0) -
                (new Date(a.createdAt).getTime() || 0)
            );
            return { ...prev, [String(statusId)]: sorted };
          });
          setTotals((t) => ({
            ...t,
            [String(statusId)]:
              typeof d.total === "number" ? d.total : t[String(statusId)] || 0,
          }));
          setPagesFetched((p) => ({
            ...p,
            [String(statusId)]: [...(p[String(statusId)] || []), nextPage],
          }));
        }
      } catch (err) {
        // ignore
      } finally {
        setLoadingMore((l) => ({ ...l, [String(statusId)]: false }));
        loadTimers.current[String(statusId)] = null;
      }
    }, 150);
  };

  // pagination via page change is not used in this simplified flow; keep loadMoreForStatus
  // for infinite scroll / manual load-more button.

  return (
    <div className="kanban-container">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban-board">
          {statuses.map((status) => {
            const columnLeads = getColumnLeads(status.id);
            return (
              <div key={status.id} className="kanban-column">
                <div className="column-header">
                  <Title level={5} className="column-title">
                    <span
                      className="status-indicator"
                      style={{
                        backgroundColor: status.color || "#6b7280",
                      }}
                    />
                    <span className="status-name">{status.name}</span>
                    <span className="status-count">{`${columnLeads.length} / ${
                      totals[String(status.id)] ?? "-"
                    }`}</span>
                  </Title>
                </div>

                <Droppable droppableId={String(status.id)}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`cards-container ${
                        snapshot.isDraggingOver ? "dragging-over" : ""
                      }`}
                      onScroll={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        if (!el) return;
                        if (
                          el.scrollTop + el.clientHeight >=
                          el.scrollHeight - 80
                        ) {
                          loadMoreForStatus(String(status.id));
                        }
                      }}
                    >
                      {columnLeads.length === 0 ? (
                        <div className="empty-column">
                          <span className="empty-icon">📋</span>
                          <span className="empty-text">No leads</span>
                        </div>
                      ) : (
                        // render loaded leads for this column
                        columnLeads.map((lead, index) => (
                          <Draggable
                            key={lead.id}
                            draggableId={lead.id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`draggable-card ${
                                  snapshot.isDragging ? "is-dragging" : ""
                                }`}
                                style={{
                                  ...provided.draggableProps.style,
                                }}
                              >
                                <LeadCard
                                  lead={lead}
                                  onClick={onLeadClick}
                                  isDragging={snapshot.isDragging}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                      {/* Load more UI */}
                      <div style={{ padding: 8, textAlign: "center" }}>
                        {loadingMore[String(status.id)] ? (
                          <div>
                            <Spin size="small" />
                          </div>
                        ) : (
                          columnLeads.length <
                            (totals[String(status.id)] || 0) && (
                            <Button
                              type="default"
                              size="small"
                              onClick={() =>
                                loadMoreForStatus(String(status.id))
                              }
                            >
                              Load more
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
};
