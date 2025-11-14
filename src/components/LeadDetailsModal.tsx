// src/components/LeadDetailsModal.tsx - COMPACT WITH ALL FIELDS

import React, { useState, useEffect } from "react";
import {
  Modal,
  Typography,
  Input,
  Button,
  Select,
  Avatar,
  message,
  Collapse,
  Badge,
  Spin,
} from "antd";
import {
  UserOutlined,
  SendOutlined,
  PhoneOutlined,
  MailOutlined,
  HomeOutlined,
  TagOutlined,
  CalendarOutlined,
  WhatsAppOutlined,
  CopyOutlined,
  SwapOutlined,
  ClockCircleOutlined,
  DownOutlined,
  InfoCircleOutlined,
  FormOutlined,
} from "@ant-design/icons";
import { Lead, User, Comment } from "../types";
import {
  addComment,
  assignLead,
  fetchStatuses,
  updateLeadStatus,
  fetchCommentsByLead,
} from "../services/api";
import "./LeadDetailsModal.css";

const { Text } = Typography;
const { TextArea } = Input;

interface LeadDetailsModalProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onLeadUpdate: (updatedLead?: Lead) => void;
  userRole: "Admin" | "SalesTeam";
  currentUser: User;
  salesTeamMembers: User[];
}

export const LeadDetailsModal: React.FC<LeadDetailsModalProps> = ({
  lead,
  isOpen,
  onClose,
  onLeadUpdate,
  userRole,
  currentUser,
  salesTeamMembers,
}) => {
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [assigningLead, setAssigningLead] = useState(false);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [statusChanging, setStatusChanging] = useState(false);
  const [selectedStatusId, setSelectedStatusId] = useState("");
  const [commentsState, setCommentsState] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    if (lead) setSelectedStatusId(String(lead.statusId || ""));
  }, [lead]);

  useEffect(() => {
    let mounted = true;
    const loadComments = async () => {
      if (!lead) return;
      setLoadingComments(true);
      try {
        const res = await fetchCommentsByLead(lead.id);
        if (mounted && res.success && res.data) {
          setCommentsState(res.data as Comment[]);
        } else if (mounted) {
          setCommentsState(lead.comments || []);
        }
      } catch (err) {
        if (mounted) setCommentsState(lead.comments || []);
      } finally {
        if (mounted) setLoadingComments(false);
      }
    };
    if (isOpen) loadComments();
    return () => {
      mounted = false;
    };
  }, [isOpen, lead]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetchStatuses();
        if (mounted && res.success && res.data) {
          setStatuses(res.data as any[]);
        }
      } catch (err) {}
    };
    if (isOpen) load();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!lead) return null;

  const handleCommentSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      const response = await addComment(lead.id, newComment);
      if (response.success) {
        setNewComment("");
        const res = await fetchCommentsByLead(lead.id);
        if (res.success && res.data) {
          setCommentsState(res.data as Comment[]);
          message.success("Comment added");
        }
        onLeadUpdate();
      } else {
        message.error(response.error || "Failed to add comment");
      }
    } catch (error) {
      message.error("Error adding comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleAssignLead = async (userId: string) => {
    if (!lead) return;
    setAssigningLead(true);
    try {
      const response = await assignLead(lead.id, userId);
      if (response.success) {
        message.success("Lead assigned");
        onLeadUpdate();
      } else {
        message.error(response.error || "Failed to assign");
      }
    } catch (error) {
      message.error("Error assigning");
    } finally {
      setAssigningLead(false);
    }
  };

  const handleStatusChange = async (statusId: string) => {
    if (!lead) return;
    setStatusChanging(true);
    try {
      const resp = await updateLeadStatus(lead.id, String(statusId));
      if (resp.success) {
        setSelectedStatusId(String(statusId));
        message.success("Status updated");
        onLeadUpdate();
      } else {
        message.error(resp.error || "Failed to update");
      }
    } catch (err) {
      message.error("Error updating");
    } finally {
      setStatusChanging(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const openWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`${label} copied`);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const getRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffMins < 60) return `${diffMins}m`;
      if (diffHours < 24) return `${diffHours}h`;
      if (diffDays < 7) return `${diffDays}d`;
      return diffDays + "d";
    } catch {
      return "";
    }
  };

  const collapseItems = [
    {
      key: "contact",
      label: (
        <span className="collapse-label">
          <MailOutlined /> Contact Info
        </span>
      ),
      children: (
        <div className="compact-details">
          {lead.email && (
            <div className="detail-row">
              <MailOutlined className="detail-icon" />
              <div className="detail-content">
                <Text className="detail-label">Email</Text>
                <a
                  href={`mailto:${lead.email}`}
                  className="detail-value detail-link"
                >
                  {lead.email}
                </a>
              </div>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyToClipboard(lead.email!, "Email")}
                className="copy-btn"
              />
            </div>
          )}
          {lead.venture && (
            <div className="detail-row">
              <HomeOutlined className="detail-icon" />
              <div className="detail-content">
                <Text className="detail-label">Venture</Text>
                <Text className="detail-value">{lead.venture}</Text>
              </div>
            </div>
          )}
          {lead.source && (
            <div className="detail-row">
              <TagOutlined className="detail-icon" />
              <div className="detail-content">
                <Text className="detail-label">Source</Text>
                <Text className="detail-value">{lead.source}</Text>
              </div>
            </div>
          )}
          <div className="detail-row">
            <CalendarOutlined className="detail-icon" />
            <div className="detail-content">
              <Text className="detail-label">Created</Text>
              <Text className="detail-value">{formatDate(lead.createdAt)}</Text>
            </div>
          </div>
          {lead.updatedAt && lead.updatedAt !== lead.createdAt && (
            <div className="detail-row">
              <ClockCircleOutlined className="detail-icon" />
              <div className="detail-content">
                <Text className="detail-label">Last Updated</Text>
                <Text className="detail-value">
                  {formatDate(lead.updatedAt)}
                </Text>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "marketing",
      label: (
        <span className="collapse-label">
          <FormOutlined /> Marketing Details
        </span>
      ),
      children: (
        <div className="compact-details">
          {lead.adName && (
            <div className="detail-row">
              <Text className="detail-label-inline">Ad Name</Text>
              <Text className="detail-value-inline">{lead.adName}</Text>
            </div>
          )}
          {lead.adsetName && (
            <div className="detail-row">
              <Text className="detail-label-inline">Ad Set</Text>
              <Text className="detail-value-inline">{lead.adsetName}</Text>
            </div>
          )}
          {lead.formName && (
            <div className="detail-row">
              <Text className="detail-label-inline">Form</Text>
              <Text className="detail-value-inline">{lead.formName}</Text>
            </div>
          )}
        </div>
      ),
    },
    lead.extraFields && Object.keys(lead.extraFields).length > 0
      ? {
          key: "extra",
          label: (
            <span className="collapse-label">
              <InfoCircleOutlined /> Additional Info{" "}
              <Badge count={Object.keys(lead.extraFields).length} />
            </span>
          ),
          children: (
            <div className="extra-fields-compact">
              {Object.entries(lead.extraFields).map(([key, value]) => (
                <div key={key} className="extra-field-row">
                  <Text className="extra-field-label">{key}</Text>
                  <Text className="extra-field-value">{String(value)}</Text>
                </div>
              ))}
            </div>
          ),
        }
      : null,
    {
      key: "comments",
      label: (
        <span className="collapse-label">
          💬 Activity <Badge count={commentsState.length} />
        </span>
      ),
      children: (
        <div className="compact-comments">
          <div className="comments-list">
            {loadingComments ? (
              <div style={{ textAlign: "center", padding: "12px" }}>
                <Spin size="small" />
              </div>
            ) : commentsState.length === 0 ? (
              <Text type="secondary" style={{ fontSize: "12px" }}>
                No comments yet
              </Text>
            ) : (
              commentsState.map((comment) => (
                <div key={comment.id} className="comment-mini">
                  <Avatar size={28} style={{ background: "#6366f1" }}>
                    {getInitials(comment.userName || "U")}
                  </Avatar>
                  <div className="comment-mini-content">
                    <div className="comment-mini-header">
                      <Text className="comment-mini-author">
                        {comment.userName || "Unknown"}
                      </Text>
                      <Text className="comment-mini-time">
                        {getRelativeTime(comment.createdAt)}
                      </Text>
                    </div>
                    <Text className="comment-mini-text">{comment.text}</Text>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="comment-input-mini">
            <div className="textarea-wrapper">
              <TextArea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add comment..."
                autoSize={{ minRows: 2, maxRows: 3 }}
                maxLength={300}
                showCount
                size="small"
              />
            </div>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleCommentSubmit}
              loading={submittingComment}
              disabled={!newComment.trim()}
              size="small"
              className="send-btn"
            >
              Send
            </Button>
          </div>
        </div>
      ),
    },
  ].filter(Boolean) as any[];

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      footer={null}
      width="min(98vw, 480px)"
      centered
      className="lead-modal-compact"
      styles={{
        body: { padding: 0 },
      }}
    >
      <div className="compact-wrapper">
        {/* COMPACT HEADER */}
        <div className="compact-header">
          <div className="header-left">
            <Avatar size={44} style={{ background: "#6366f1" }}>
              {getInitials(lead.name)}
            </Avatar>
            <div className="header-info">
              <Text className="header-name">{lead.name}</Text>
              <Text className="header-time">
                <ClockCircleOutlined /> {getRelativeTime(lead.createdAt)}
              </Text>
            </div>
          </div>
        </div>

        {/* PHONE ACTIONS */}
        {lead.phone && (
          <div className="phone-compact">
            <a href={`tel:${lead.phone}`} className="phone-number-link">
              <PhoneOutlined /> {lead.phone}
            </a>
            <div className="phone-actions-mini">
              <Button
                type="text"
                icon={<PhoneOutlined />}
                onClick={() => (window.location.href = `tel:${lead.phone}`)}
                size="small"
              >
                Call
              </Button>
              <Button
                type="text"
                icon={<WhatsAppOutlined />}
                onClick={() => openWhatsApp(lead.phone)}
                size="small"
                style={{ color: "#25d366" }}
              >
                WhatsApp
              </Button>
              <Button
                type="text"
                icon={<CopyOutlined />}
                onClick={() => copyToClipboard(lead.phone, "Phone")}
                size="small"
              >
                Copy
              </Button>
            </div>
          </div>
        )}

        {/* COMPACT ACTIONS */}
        <div className="compact-actions">
          <div className="action-compact">
            <Text className="action-label">
              <SwapOutlined /> Status
            </Text>
            <Select
              value={selectedStatusId}
              onChange={handleStatusChange}
              size="small"
              style={{ width: "100%" }}
              disabled={statusChanging}
            >
              {statuses.map((s) => (
                <Select.Option key={s.id} value={String(s.id)}>
                  {s.name}
                </Select.Option>
              ))}
            </Select>
          </div>

          {userRole === "Admin" && (
            <div className="action-compact">
              <Text className="action-label">
                <UserOutlined /> Assign To
              </Text>
              <Select
                value={lead.assignedTo ? String(lead.assignedTo.id) : undefined}
                onChange={handleAssignLead}
                size="small"
                style={{ width: "100%" }}
                disabled={assigningLead}
                placeholder="Select user..."
              >
                {salesTeamMembers.map((member) => (
                  <Select.Option key={member.id} value={String(member.id)}>
                    {member.name}
                  </Select.Option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {/* COLLAPSIBLE SECTIONS - ALL FIELDS */}
        <Collapse
          items={collapseItems}
          ghost
          defaultActiveKey={["contact", "marketing", "extra", "comments"]}
          expandIcon={({ isActive }) => (
            <DownOutlined rotate={isActive ? 180 : 0} />
          )}
          className="compact-collapse"
        />
      </div>
    </Modal>
  );
};
