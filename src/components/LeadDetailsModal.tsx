// src/components/LeadDetailsModal.tsx
import React, { useState } from "react";
import {
  Modal,
  Typography,
  Input,
  Button,
  Select,
  List,
  Avatar,
  Tag,
  Space,
  message,
  Divider,
} from "antd";
import {
  UserOutlined,
  SendOutlined,
  PhoneOutlined,
  MailOutlined,
  HomeOutlined,
  TagOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  WhatsAppOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import { Lead, User, Comment } from "../types";
import { addComment, assignLead } from "../services/api";
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

  if (!lead) return null;

  const handleCommentSubmit = async () => {
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const response = await addComment(lead.id, newComment);
      if (response.success) {
        setNewComment("");
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

  const getStatusColor = () => {
    const colors: Record<string, string> = {
      "1": "#3b82f6",
      "2": "#f59e0b",
      "3": "#8b5cf6",
      "4": "#10b981",
      "5": "#ef4444",
    };
    return colors[lead.statusId] || "#6b7280";
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
    message.success(`${label} copied to clipboard`);
  };

  const openWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
  };

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      width={900}
      className="lead-details-modal"
      title={null}
      footer={null}
      destroyOnClose
    >
      <div className="modal-content">
        {/* Compact Header */}
        <div className="modal-header-compact">
          <div className="header-left">
            <Avatar
              size={56}
              style={{
                backgroundColor: getStatusColor(),
                fontSize: "22px",
                fontWeight: 700,
              }}
            >
              {getInitials(lead.name)}
            </Avatar>
            <div className="header-text">
              <Title level={2} className="lead-name-prominent">
                {lead.name}
              </Title>
              {/* <Tag
                color={getStatusColor()}
                className="status-tag-compact"
                style={{ backgroundColor: getStatusColor() }}
              >
                {lead.status}
              </Tag> */}
            </div>
          </div>

          {/* Prominent Phone - Right Side */}
          {lead.phone && (
            <div className="phone-highlight-box">
              <PhoneOutlined className="phone-icon-large" />
              <div className="phone-content">
                <Text className="phone-label">Contact</Text>
                <Text className="phone-number-large">{lead.phone}</Text>
                <div className="phone-actions">
                  <Button
                    size="small"
                    icon={<WhatsAppOutlined />}
                    onClick={() => openWhatsApp(lead.phone)}
                    type="link"
                    className="whatsapp-btn"
                  >
                    WhatsApp
                  </Button>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(lead.phone, "Phone")}
                    type="link"
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Assignee Highlight Card */}
        <div className="assignee-highlight-card">
          <div className="assignee-info">
            <UserOutlined className="assignee-icon" />
            <div className="assignee-content">
              <Text className="assignee-label">Assigned To</Text>
              {userRole === "Admin" ? (
                <Select
                  className="assignee-select-inline"
                  placeholder="Not assigned"
                  value={lead.assignedTo?.id}
                  onChange={handleAssignLead}
                  loading={assigningLead}
                  bordered={false}
                  size="large"
                >
                  {salesTeamMembers.map((member) => (
                    <Select.Option key={member.id} value={member.id}>
                      <Space>
                        <Avatar
                          size="small"
                          style={{ backgroundColor: "#6366f1" }}
                        >
                          {getInitials(member.name)}
                        </Avatar>
                        <Text strong>{member.name}</Text>
                      </Space>
                    </Select.Option>
                  ))}
                </Select>
              ) : (
                <Text className="assignee-name">
                  {lead.assignedTo?.name || "Unassigned"}
                </Text>
              )}
            </div>
          </div>
          <div className="timeline-compact">
            <CalendarOutlined className="timeline-icon-small" />
            <Text className="timeline-text-small">
              Created{" "}
              {new Date(lead.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </Text>
          </div>
        </div>

        {/* Compact Info Grid */}
        <div className="compact-info-section">
          <div className="compact-info-row">
            <div className="compact-info-item">
              <MailOutlined className="compact-icon" />
              <Text className="compact-value" copyable>
                {lead.email || "No email"}
              </Text>
            </div>
            <div className="compact-info-item">
              <HomeOutlined className="compact-icon" />
              <Text className="compact-value">
                {lead.venture || "No venture"}
              </Text>
            </div>
          </div>
          <div className="compact-info-row">
            <div className="compact-info-item">
              <TagOutlined className="compact-icon" />
              <Text className="compact-value">
                {lead.source || "No source"}
              </Text>
            </div>
            <div className="compact-info-item">
              <TagOutlined className="compact-icon" />
              <Text className="compact-value">
                {lead.adName || "No ad name"}
              </Text>
            </div>
          </div>
        </div>

        {/* Extra Fields - Compact */}
        {lead.extraFields && Object.keys(lead.extraFields).length > 0 && (
          <div className="extra-fields-compact">
            <Text className="section-title-compact">Additional Responses</Text>
            <div className="extra-fields-grid">
              {Object.entries(lead.extraFields).map(([k, v]) => (
                <div key={k} className="extra-field-item">
                  <Text className="extra-field-label">{k}</Text>
                  <Text className="extra-field-value">{v}</Text>
                </div>
              ))}
            </div>
          </div>
        )}

        <Divider style={{ margin: "16px 0" }} />

        {/* Comments Section - PROMINENT */}
        <div className="comments-section-prominent">
          <Title level={4} className="comments-title-prominent">
            💬 Activity & Comments ({lead.comments?.length || 0})
          </Title>

          <div className="comments-list-compact">
            {!lead.comments || lead.comments.length === 0 ? (
              <div className="empty-comments-compact">
                <Text type="secondary">
                  No comments yet. Start the conversation!
                </Text>
              </div>
            ) : (
              lead.comments.map((comment: Comment) => (
                <div key={comment.id} className="comment-item-compact">
                  <Avatar
                    size={36}
                    style={{
                      backgroundColor: "#6366f1",
                      fontWeight: 600,
                    }}
                  >
                    {getInitials(comment.userName || "User")}
                  </Avatar>
                  <div className="comment-bubble">
                    <div className="comment-meta">
                      <Text strong className="comment-author-compact">
                        {comment.userName || "Unknown"}
                      </Text>
                      <Text className="comment-time-compact">
                        {new Date(comment.createdAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </Text>
                    </div>
                    <Text className="comment-text-compact">{comment.text}</Text>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Comment - Streamlined */}
          <div className="comment-form-compact">
            <Avatar
              size={36}
              style={{ backgroundColor: "#8b5cf6", fontWeight: 600 }}
            >
              {getInitials(currentUser.name)}
            </Avatar>
            <div className="comment-input-wrapper">
              <TextArea
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 4 }}
                maxLength={500}
                className="comment-textarea-compact"
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleCommentSubmit}
                loading={submittingComment}
                disabled={!newComment.trim()}
                className="submit-btn-compact"
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
