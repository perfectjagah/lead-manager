// src/components/KanbanBoard.tsx
import React, { useState, useEffect, useRef, useCallback } from "react";
// drag-drop removed: rendering static columns
import { Typography, Spin, message, Button, Select } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import { LeadCard } from "./LeadCard";
import {
  fetchLeads,
  fetchStatuses,
  fetchLeadsByStatus,
  fetchUsers,
} from "../services/api";
import { Lead } from "../types";
import "./KanbanBoard.css";

const { Title } = Typography;

interface KanbanBoardProps {
  onLeadClick: (lead: Lead) => void;
  userRole: "Admin" | "SalesTeam";
  userId: string;
  onReady?: (helpers: {
    reload: () => Promise<void>;
    updateLead: (lead: Lead) => void;
  }) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  onLeadClick,
  userRole,
  userId,
  onReady,
}) => {
  // leadsByStatus stores loaded pages per status
  const [leadsByStatus, setLeadsByStatus] = useState<Record<string, Lead[]>>(
    {}
  );
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [salesMembers, setSalesMembers] = useState<any[]>([]);
  const [salesFilter, setSalesFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [expandedStatus, setExpandedStatus] = useState<Record<string, boolean>>(
    {}
  );
  const [isMobile, setIsMobile] = useState(false);
  // page size used for paginated requests
  const PAGE_SIZE = 10;

  // track which pages have been fetched per status (1-based pages)
  const [pagesFetched, setPagesFetched] = useState<Record<string, number[]>>(
    {}
  );
  const [loadingMore, setLoadingMore] = useState<Record<string, boolean>>({});
  const loadTimers = useRef<Record<string, number | null>>({});
  // track pages currently being fetched to prevent duplicate concurrent fetches
  const inProgressPagesRef = useRef<Record<string, Set<number>>>({});
  // generation token to ignore stale responses from earlier loads
  const loadGenRef = useRef<number>(0);

  const loadLeads = async (assignedFilterOverride?: string | null) => {
    // bump generation so previous in-flight responses are ignored
    const myGen = ++loadGenRef.current;
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
              const assignedFilterParam =
                userRole && userRole !== "Admin"
                  ? userId
                  : (assignedFilterOverride ?? salesFilter) || undefined;

              const res = await fetchLeadsByStatus(
                String(st.id),
                PAGE_SIZE,
                1,
                assignedFilterParam
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

                // ignore stale responses from previous generations
                if (loadGenRef.current !== myGen) return;

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

  // Handle mobile detection and column state initialization
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Initialize expanded state when statuses load
  useEffect(() => {
    if (statuses.length > 0) {
      const initialState: Record<string, boolean> = {};
      statuses.forEach((status) => {
        initialState[String(status.id)] = !isMobile; // Expanded on desktop, collapsed on mobile
      });
      setExpandedStatus(initialState);
    }
  }, [statuses, isMobile]);

  const toggleColumn = useCallback((statusId: string) => {
    setExpandedStatus((prev) => ({
      ...prev,
      [String(statusId)]: !prev[String(statusId)],
    }));
  }, []);

  const reloadLeads = useCallback(async () => {
    // Reset pages fetched to force a fresh load
    setPagesFetched({});
    await loadLeads();
  }, [loadLeads]);

  // Update a single lead in the local per-status buckets without full reload
  const updateLead = useCallback(
    (updatedLead: Lead) => {
      setLeadsByStatus((prev) => {
        const copy: Record<string, Lead[]> = { ...prev };
        // remove the lead from any bucket it currently exists in
        Object.keys(copy).forEach((sid) => {
          copy[sid] = (copy[sid] || []).filter((l) => l.id !== updatedLead.id);
        });

        const newSid = String(updatedLead.statusId || "");
        if (!copy[newSid]) copy[newSid] = [];

        // insert updated lead into its status bucket and keep newest-first ordering
        copy[newSid] = [updatedLead, ...(copy[newSid] || [])].sort(
          (a, b) =>
            (new Date(b.createdAt).getTime() || 0) -
            (new Date(a.createdAt).getTime() || 0)
        );

        // recompute totals from bucket lengths to keep UI consistent
        const newTotals: Record<string, number> = {};
        Object.entries(copy).forEach(([sid, arr]) => {
          newTotals[sid] = arr.length;
        });
        setTotals(() => newTotals);

        return copy;
      });
    },
    [totals]
  );

  useEffect(() => {
    loadLeads();
  }, [userRole, userId]);

  // Load sales team members for Admin filter
  const loadSalesMembers = async () => {
    try {
      const res = await fetchUsers();
      if (res.success && res.data) {
        const sales = res.data as any[];
        setSalesMembers(sales);
      }
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    if (userRole === "Admin") loadSalesMembers();
  }, [userRole]);

  // Helper to reset pending timers/in-progress markers and reload with a specific filter
  const resetAndLoadWithFilter = (filter: string | null) => {
    // clear any pending load timers
    try {
      Object.keys(loadTimers.current).forEach((k) => {
        const t = loadTimers.current[k];
        if (t) {
          window.clearTimeout(t as number);
        }
        loadTimers.current[k] = null;
      });
    } catch {}

    // clear in-progress pages so new fetches can proceed
    inProgressPagesRef.current = {};

    // reset pagination buckets and totals
    setPagesFetched({});
    setLeadsByStatus({});
    setTotals({});

    // update state and immediately load with override to avoid stale-state races
    setSalesFilter(filter);
    loadLeads(filter);
  };

  // Expose reloadLeads to parent
  useEffect(() => {
    if (onReady) {
      onReady({ reload: reloadLeads, updateLead });
    }
  }, [onReady, reloadLeads, updateLead]);

  // drag-drop removed: no onDragEnd handler

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
      const pageToFetch = nextPage;
      const pageGen = loadGenRef.current;

      // initialize in-progress set for this status
      if (!inProgressPagesRef.current[String(statusId)])
        inProgressPagesRef.current[String(statusId)] = new Set<number>();

      // if this page is already being fetched, skip
      if (inProgressPagesRef.current[String(statusId)].has(pageToFetch)) {
        setLoadingMore((l) => ({ ...l, [String(statusId)]: false }));
        loadTimers.current[String(statusId)] = null;
        return;
      }

      // mark as in-progress immediately to avoid concurrent fetches
      inProgressPagesRef.current[String(statusId)].add(pageToFetch);

      try {
        const assignedFilterParam =
          userRole && userRole !== "Admin" ? userId : salesFilter || undefined;

        const res = await fetchLeadsByStatus(
          String(statusId),
          PAGE_SIZE,
          pageToFetch,
          assignedFilterParam
        );
        if (res.success && res.data) {
          // ignore stale page responses
          if (loadGenRef.current !== pageGen) {
            inProgressPagesRef.current[String(statusId)].delete(pageToFetch);
            setLoadingMore((l) => ({ ...l, [String(statusId)]: false }));
            loadTimers.current[String(statusId)] = null;
            return;
          }
          const d = res.data as any;
          // Defensive filter for appended page
          const incomingPage: Lead[] = (d.leads || []).filter(
            (l: Lead) => String(l.statusId) === String(statusId)
          );

          setLeadsByStatus((prev) => {
            const existing = prev[String(statusId)] || [];
            const existingIds = new Set(existing.map((e) => e.id));
            // only append items that are not already present
            const dedupedIncoming = incomingPage.filter(
              (it) => !existingIds.has(it.id)
            );
            const merged = [...existing, ...dedupedIncoming];
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

          // mark page as fetched
          setPagesFetched((p) => ({
            ...p,
            [String(statusId)]: [...(p[String(statusId)] || []), nextPage],
          }));
        }
      } catch (err) {
        // if fetch failed, remove in-progress mark so future attempts can retry
        inProgressPagesRef.current[String(statusId)].delete(pageToFetch);
      } finally {
        // cleanup
        inProgressPagesRef.current[String(statusId)].delete(pageToFetch);
        setLoadingMore((l) => ({ ...l, [String(statusId)]: false }));
        loadTimers.current[String(statusId)] = null;
      }
    }, 150);
  };

  // pagination via page change is not used in this simplified flow; keep loadMoreForStatus
  // for infinite scroll / manual load-more button.

  return (
    <div className="kanban-container">
      {/* Top controls: sales-person filter (Admin only) */}
      {userRole === "Admin" && (
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          <Select
            allowClear
            placeholder="Filter by sales person"
            style={{ minWidth: 220 }}
            value={salesFilter || undefined}
            onChange={(val) => {
              const v = val || null;
              resetAndLoadWithFilter(v);
            }}
          >
            {salesMembers.map((m) => (
              <Select.Option key={m.id} value={String(m.id)}>
                {m.name}
              </Select.Option>
            ))}
          </Select>
          <Button onClick={() => resetAndLoadWithFilter(null)}>Clear</Button>
        </div>
      )}

      <div className="kanban-board">
        {statuses.map((status) => {
          const columnLeads = getColumnLeads(status.id);
          return (
            <div
              key={status.id}
              className={`kanban-column ${
                !expandedStatus[String(status.id)] ? "collapsed" : ""
              }`}
            >
              <div
                className="column-header"
                onClick={() => toggleColumn(String(status.id))}
              >
                <Title level={5} className="column-title">
                  <Button
                    type="text"
                    className="column-toggle"
                    // onClick={() => toggleColumn(String(status.id))}
                    icon={
                      expandedStatus[String(status.id)] ? (
                        <DownOutlined />
                      ) : (
                        <RightOutlined />
                      )
                    }
                  />
                  <span
                    className="status-indicator"
                    style={{ backgroundColor: status.color || "#6b7280" }}
                  />
                  <span className="status-name">{status.name}</span>
                  <span className="status-count">{`${columnLeads.length} / ${
                    totals[String(status.id)] ?? "-"
                  }`}</span>
                </Title>
              </div>

              <div
                className={`cards-container`}
                onScroll={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  if (!el) return;
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
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
                  columnLeads.map((lead) => (
                    <div key={lead.id} className={`draggable-card`}>
                      <LeadCard lead={lead} onClick={onLeadClick} />
                    </div>
                  ))
                )}

                <div style={{ padding: 8, textAlign: "center" }}>
                  {loadingMore[String(status.id)] ? (
                    <div>
                      <Spin size="small" />
                    </div>
                  ) : (
                    columnLeads.length < (totals[String(status.id)] || 0) && (
                      <Button
                        type="default"
                        size="small"
                        onClick={() => loadMoreForStatus(String(status.id))}
                      >
                        Load more
                      </Button>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
