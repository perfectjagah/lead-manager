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

  useEffect(() => {
    if (lead) setSelectedStatusId(String(lead.statusId || ""));
  }, [lead]);

  // load comments for this lead when modal opens or lead changes
  useEffect(() => {
    let mounted = true;
    const loadComments = async () => {
      if (!lead) return;
      try {
        const res = await fetchCommentsByLead(lead.id);
        if (mounted && res.success && res.data) {
          setCommentsState(res.data as Comment[]);
        } else if (mounted) {
          // fallback to any comments embedded in the lead
          setCommentsState(lead.comments || []);
        }
      } catch (err) {
        if (mounted) setCommentsState(lead.comments || []);
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
      const response = await addComment(lead.id, newComment);
      if (response.success) {
        setNewComment("");
        // refresh comments for this lead
        try {
          const res = await fetchCommentsByLead(lead.id);
          if (res.success && res.data) setCommentsState(res.data as Comment[]);
        } catch (e) {
          // ignore
        }
        onLeadUpdate();
        message.success("Comment added successfully");
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
    setAssigningLead(true);
    try {
      const response = await assignLead(lead.id, userId);
      if (response.success) {
        onLeadUpdate();
        message.success("Lead assigned successfully");
      } else {
        message.error(response.error || "Failed to assign lead");
      }
    } catch (error) {
      message.error("Error assigning lead");
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
        message.error(resp.error || "Failed to update status");
      }
    } catch (err) {
      message.error("Error updating status");
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

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      width={850}
      className="lead-modal-v2"
      title={null}
      footer={null}
      destroyOnClose
    >
      <div className="lead-modal-content">
        {/* HERO SECTION - Name, Phone, Status */}
        <div className="lead-hero">
          <div className="hero-left">
            <Avatar
              size={60}
              className="hero-avatar"
              style={{ backgroundColor: getStatusColor() }}
            >
              {getInitials(lead.name)}
            </Avatar>
            <div className="hero-info">
              <Title level={2} className="hero-name">
                {lead.name}
              </Title>
              <Space size="small" className="hero-meta">
                <CalendarOutlined />
                <Text className="hero-date">{formatDate(lead.createdAt)}</Text>
              </Space>
            </div>
          </div>

          {lead.phone && (
            <div className="hero-phone">
              <PhoneOutlined className="hero-phone-icon" />
              <div>
                <Text className="hero-phone-label">Phone</Text>
                <Text className="hero-phone-number">{lead.phone}</Text>
                <div className="hero-phone-actions">
                  <Button
                    size="small"
                    type="text"
                    icon={<WhatsAppOutlined />}
                    onClick={() => openWhatsApp(lead.phone)}
                    className="btn-whatsapp"
                  >
                    WhatsApp
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(lead.phone, "Phone")}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* STATUS & ASSIGNMENT ROW */}
        <Row gutter={12} className="action-row">
          <Col span={12}>
            <div className="action-card">
              <SwapOutlined className="action-icon" />
              <div className="action-content">
                <Text className="action-label">Status</Text>
                <Select
                  value={selectedStatusId}
                  onChange={handleStatusChange}
                  loading={statusChanging}
                  className="action-select"
                  size="large"
                >
                  {statuses.map((s) => (
                    <Select.Option key={s.id} value={String(s.id)}>
                      {s.name}
                    </Select.Option>
                  ))}
                </Select>
              </div>
            </div>
          </Col>

          <Col span={12}>
            <div className="action-card">
              <UserOutlined className="action-icon" />
              <div className="action-content">
                <Text className="action-label">Assigned To</Text>
                {userRole === "Admin" ? (
                  <Select
                    value={lead.assignedTo?.id}
                    onChange={handleAssignLead}
                    loading={assigningLead}
                    className="action-select"
                    size="large"
                    placeholder="Unassigned"
                  >
                    {salesTeamMembers.map((member) => (
                      <Select.Option key={member.id} value={member.id}>
                        {member.name}
                      </Select.Option>
                    ))}
                  </Select>
                ) : (
                  <Text className="action-value">
                    {lead.assignedTo?.name || "Unassigned"}
                  </Text>
                )}
              </div>
            </div>
          </Col>
        </Row>

        {/* CONTACT DETAILS - 2 Column Grid */}
        <div className="details-section">
          <Text className="section-label">Contact Details</Text>
          <Row gutter={[12, 12]} className="details-grid">
            <Col span={12}>
              <div className="detail-item">
                <MailOutlined className="detail-icon" />
                <div className="detail-text">
                  <Text className="detail-label">Email</Text>
                  <Text className="detail-value" copyable>
                    {lead.email || "—"}
                  </Text>
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div className="detail-item">
                <HomeOutlined className="detail-icon" />
                <div className="detail-text">
                  <Text className="detail-label">Venture</Text>
                  <Text className="detail-value">{lead.venture || "—"}</Text>
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div className="detail-item">
                <TagOutlined className="detail-icon" />
                <div className="detail-text">
                  <Text className="detail-label">Source</Text>
                  <Text className="detail-value">{lead.source || "—"}</Text>
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div className="detail-item">
                <TagOutlined className="detail-icon" />
                <div className="detail-text">
                  <Text className="detail-label">Ad Name</Text>
                  <Text className="detail-value">{lead.adName || "—"}</Text>
                </div>
              </div>
            </Col>
          </Row>
        </div>

        {/* EXTRA FIELDS */}
        {lead.extraFields && Object.keys(lead.extraFields).length > 0 && (
          <div className="details-section">
            <Text className="section-label">Additional Information</Text>
            <div className="extra-fields">
              {Object.entries(lead.extraFields).map(([key, value]) => (
                <div key={key} className="extra-field">
                  <Text className="extra-label">{key}</Text>
                  <Text className="extra-value">{value}</Text>
                </div>
              ))}
            </div>
          </div>
        )}

        <Divider className="section-divider" />

        {/* COMMENTS SECTION */}
        <div className="comments-section">
          <div className="comments-header">
            <Title level={5} className="comments-title">
              💬 Comments
            </Title>
            <Text className="comments-count">{lead.comments?.length || 0}</Text>
          </div>

          <div className="comments-list">
            {!commentsState || commentsState.length === 0 ? (
              <div className="comments-empty">
                <Text type="secondary">No comments yet</Text>
              </div>
            ) : (
              commentsState.map((comment: Comment) => (
                <div key={comment.id} className="comment">
                  <Avatar size={32} className="comment-avatar">
                    {getInitials(comment.userName || "U")}
                  </Avatar>
                  <div className="comment-body">
                    <div className="comment-header">
                      <Text strong className="comment-author">
                        {comment.userName || "Unknown"}
                      </Text>
                      <Text className="comment-date">
                        {formatDate(comment.createdAt)}
                      </Text>
                    </div>
                    <Text className="comment-text">{comment.text}</Text>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ADD COMMENT */}
          <div className="comment-form">
            <Avatar size={32} className="form-avatar">
              {getInitials(currentUser.name)}
            </Avatar>
            <div className="form-input-group">
              <TextArea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 4 }}
                maxLength={500}
                showCount
                className="form-textarea"
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleCommentSubmit}
                loading={submittingComment}
                disabled={!newComment.trim()}
                className="form-submit"
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
