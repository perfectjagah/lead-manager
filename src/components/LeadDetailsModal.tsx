// src/components/LeadDetailsModal.tsx
import React, { useState, useEffect } from "react";
import {
  Modal,
  Typography,
  Input,
  Button,
  Select,
  Avatar,
  Space,
  message,
  Divider,
  Row,
  Col,
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

const { Text, Title } = Typography;
const { TextArea } = Input;

interface LeadDetailsModalProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onLeadUpdate: () => void;
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
  const [selectedStatusId, setSelectedStatusId] = useState<string>("");
  const [commentsState, setCommentsState] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const isAnyLoading = submittingComment || assigningLead || statusChanging;

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
      } catch (err) {
        // ignore
      }
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
      message.loading({ content: "Adding comment...", key: "addComment" });
      const response = await addComment(lead.id, newComment);
      if (response.success) {
        setNewComment("");
        try {
          const res = await fetchCommentsByLead(lead.id);
          if (res.success && res.data) {
            setCommentsState(res.data as Comment[]);
            message.success({
              content: "Comment added",
              key: "addComment",
              duration: 2,
            });
          }
        } catch (e) {
          message.error({
            content: "Failed to refresh comments",
            key: "addComment",
          });
        }
        onLeadUpdate();
      } else {
        message.error({
          content: response.error || "Failed to add comment",
          key: "addComment",
        });
      }
    } catch (error) {
      message.error({ content: "Error adding comment", key: "addComment" });
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleAssignLead = async (userId: string) => {
    if (!lead) return;
    setAssigningLead(true);
    try {
      message.loading({ content: "Assigning...", key: "assignLead" });
      const response = await assignLead(lead.id, userId);
      if (response.success) {
        message.success({
          content: "Lead assigned",
          key: "assignLead",
          duration: 2,
        });
        onLeadUpdate();
      } else {
        message.error({
          content: response.error || "Failed to assign",
          key: "assignLead",
        });
      }
    } catch (error) {
      message.error({ content: "Error assigning", key: "assignLead" });
    } finally {
      setAssigningLead(false);
    }
  };

  const handleStatusChange = async (statusId: string) => {
    if (!lead) return;
    setStatusChanging(true);
    try {
      message.loading({ content: "Updating...", key: "updateStatus" });
      const resp = await updateLeadStatus(lead.id, String(statusId));
      if (resp.success) {
        setSelectedStatusId(String(statusId));
        message.success({
          content: "Status updated",
          key: "updateStatus",
          duration: 2,
        });
        onLeadUpdate();
      } else {
        message.error({
          content: resp.error || "Failed to update",
          key: "updateStatus",
        });
      }
    } catch (err) {
      message.error({ content: "Error updating", key: "updateStatus" });
    } finally {
      setStatusChanging(false);
    }
  };

  const getStatusColor = () => {
    const colors: Record<string, string> = {
      "1": "#3b82f6",
      "2": "#f59e0b",
      "3": "#8b5cf6",
      "4": "#10b981",
      "5": "#ef4444",
    };
    return colors[String(lead.statusId)] || "#6b7280";
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`${label} copied`);
  };

  const openWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
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

      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return formatDate(dateStr);
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      {isAnyLoading && (
        <div className="loading-overlay">
          <Spin size="large" />
        </div>
      )}
      <Modal
        open={isOpen}
        onCancel={onClose}
        width={920}
        className="lead-modal-modern"
        title={null}
        footer={null}
        destroyOnClose
        centered
      >
        <div className="modal-wrapper">
          {/* HERO HEADER */}
          <div className="modal-hero">
            <div className="hero-main">
              <Avatar
                size={68}
                className="hero-avatar"
                style={{ backgroundColor: getStatusColor() }}
              >
                {getInitials(lead.name)}
              </Avatar>
              <div className="hero-details">
                <Title level={2} className="hero-title">
                  {lead.name}
                </Title>
                <Space size="middle" className="hero-meta">
                  <span className="hero-meta-item">
                    <ClockCircleOutlined />
                    {getRelativeTime(lead.createdAt)}
                  </span>
                  {lead.adName && (
                    <span className="hero-meta-item">
                      <TagOutlined />
                      {lead.adName}
                    </span>
                  )}
                </Space>
              </div>
            </div>

            {lead.phone && (
              <div className="hero-phone-card">
                <PhoneOutlined className="phone-card-icon" />
                <div className="phone-card-content">
                  <Text className="phone-card-label">Phone</Text>
                  <a
                    href={`tel:${lead.phone}`}
                    className="phone-card-number"
                    onClick={() => {
                      // Optional: Add analytics or logging here
                      console.log("Phone number clicked:", lead.phone);
                    }}
                  >
                    {lead.phone}
                  </a>
                </div>
                <div className="phone-card-actions">
                  <Button
                    type="text"
                    size="small"
                    icon={<WhatsAppOutlined />}
                    onClick={() => openWhatsApp(lead.phone)}
                    className="phone-action-btn whatsapp-btn"
                  >
                    WhatsApp
                  </Button>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(lead.phone, "Phone")}
                    className="phone-action-btn"
                  >
                    Copy
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* QUICK ACTIONS */}
          <div className="quick-actions">
            <div className="action-item">
              <SwapOutlined className="action-item-icon" />
              <div className="action-item-content">
                <Text className="action-item-label">Status</Text>
                <Select
                  value={selectedStatusId}
                  onChange={handleStatusChange}
                  loading={statusChanging}
                  className="action-select"
                  disabled={isAnyLoading}
                >
                  {statuses.map((s) => (
                    <Select.Option key={s.id} value={String(s.id)}>
                      {s.name}
                    </Select.Option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="action-item">
              <UserOutlined className="action-item-icon" />
              <div className="action-item-content">
                <Text className="action-item-label">Assigned To</Text>
                {userRole === "Admin" ? (
                  <Select
                    value={lead.assignedTo?.id}
                    onChange={handleAssignLead}
                    loading={assigningLead}
                    className="action-select"
                    placeholder="Unassigned"
                    disabled={isAnyLoading}
                  >
                    {salesTeamMembers.map((member) => (
                      <Select.Option key={member.id} value={member.id}>
                        {member.name}
                      </Select.Option>
                    ))}
                  </Select>
                ) : (
                  <Text className="action-static-value">
                    {lead.assignedTo?.name || "Unassigned"}
                  </Text>
                )}
              </div>
            </div>
          </div>

          {/* INFO GRID */}
          <div className="info-section">
            <Text className="section-header">Contact Details</Text>
            <Row gutter={[12, 12]} className="info-grid">
              <Col xs={24} sm={12}>
                <div className="info-card">
                  <MailOutlined className="info-card-icon" />
                  <div className="info-card-text">
                    <Text className="info-card-label">Email</Text>
                    <Text className="info-card-value" copyable ellipsis>
                      {lead.email || "—"}
                    </Text>
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div className="info-card">
                  <HomeOutlined className="info-card-icon" />
                  <div className="info-card-text">
                    <Text className="info-card-label">Venture</Text>
                    <Text className="info-card-value" ellipsis>
                      {lead.venture || "—"}
                    </Text>
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div className="info-card">
                  <TagOutlined className="info-card-icon" />
                  <div className="info-card-text">
                    <Text className="info-card-label">Source</Text>
                    <Text className="info-card-value" ellipsis>
                      {lead.source || "—"}
                    </Text>
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div className="info-card">
                  <CalendarOutlined className="info-card-icon" />
                  <div className="info-card-text">
                    <Text className="info-card-label">Created</Text>
                    <Text className="info-card-value">
                      {formatDate(lead.createdAt)}
                    </Text>
                  </div>
                </div>
              </Col>
            </Row>
          </div>

          {/* EXTRA FIELDS */}
          {lead.extraFields && Object.keys(lead.extraFields).length > 0 && (
            <div className="info-section">
              <Text className="section-header">Additional Information</Text>
              <div className="extra-fields-grid">
                {Object.entries(lead.extraFields).map(([key, value]) => (
                  <div key={key} className="extra-field-card">
                    <Text className="extra-field-label">{key}</Text>
                    <Text className="extra-field-value">{value}</Text>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Divider className="modal-divider" />

          {/* COMMENTS */}
          <div className="comments-section">
            <div className="comments-header">
              <Space>
                <Title level={5} className="comments-title">
                  💬 Activity
                </Title>
                <span className="comments-badge">{commentsState.length}</span>
              </Space>
            </div>

            <div className="comments-body">
              {loadingComments ? (
                <div className="comments-loading">
                  <Spin />
                </div>
              ) : !commentsState || commentsState.length === 0 ? (
                <div className="comments-empty">
                  <Text type="secondary">No comments yet</Text>
                </div>
              ) : (
                commentsState.map((comment: Comment) => (
                  <div key={comment.id} className="comment-bubble">
                    <Avatar
                      size={36}
                      className="comment-avatar"
                      style={{ backgroundColor: "#6366f1" }}
                    >
                      {getInitials(comment.userName || "U")}
                    </Avatar>
                    <div className="comment-content">
                      <div className="comment-meta">
                        <Text strong className="comment-author">
                          {comment.userName || "Unknown"}
                        </Text>
                        <Text className="comment-time">
                          {getRelativeTime(comment.createdAt)}
                        </Text>
                      </div>
                      <Text className="comment-message">{comment.text}</Text>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ADD COMMENT */}
            <div className="comment-input-section">
              <Avatar
                size={36}
                style={{ backgroundColor: "#8b5cf6" }}
                className="input-avatar"
              >
                {getInitials(currentUser.name)}
              </Avatar>
              <div className="input-wrapper">
                <TextArea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  maxLength={500}
                  showCount
                  className="input-textarea"
                  disabled={isAnyLoading}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleCommentSubmit}
                  loading={submittingComment}
                  disabled={!newComment.trim() || isAnyLoading}
                  className="input-submit-btn"
                >
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};
