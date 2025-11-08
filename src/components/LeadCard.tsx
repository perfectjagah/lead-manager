// src/components/LeadCard.tsx
import React from "react";
import { Card, Typography, Avatar } from "antd";
import {
  PhoneOutlined,
  MailOutlined,
  UserOutlined,
  HomeOutlined,
  TagOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { Lead } from "../types";
import "./LeadCard.css";

const { Text } = Typography;

interface LeadCardProps {
  lead: Lead;
  onClick: (lead: Lead) => void;
  isDragging?: boolean;
}

export const LeadCard: React.FC<LeadCardProps> = ({
  lead,
  onClick,
  isDragging,
}) => {
  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Get avatar color based on status
  const getAvatarColor = () => {
    const colors: Record<string, string> = {
      "1": "#3b82f6", // New - Blue
      "2": "#f59e0b", // Working - Amber
      "3": "#8b5cf6", // Visit Confirmed - Purple
      "4": "#10b981", // Ready to Buy - Green
      "5": "#ef4444", // Rejected - Red
    };
    const sid = String(lead.statusId || "");
    return colors[sid] || "#6b7280";
  };

  // Format date for better readability
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      // Show relative time for recent leads
      if (diffMins < 60) {
        return `${diffMins}m ago`;
      } else if (diffHours < 24) {
        return `${diffHours}h ago`;
      } else if (diffDays < 7) {
        return `${diffDays}d ago`;
      }

      // Show formatted date for older leads
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Card
      className={`lead-card ${isDragging ? "lead-card-dragging" : ""}`}
      onClick={() => onClick(lead)}
      bordered={false}
    >
      {/* Status Indicator Bar */}
      <div
        className="lead-card-status-bar"
        style={{ backgroundColor: getAvatarColor() }}
      />

      {/* Header with Avatar and Name */}
      <div className="lead-card-header">
        <Avatar
          size={46}
          style={{
            backgroundColor: getAvatarColor(),
            fontWeight: 600,
            fontSize: "18px",
          }}
        >
          {getInitials(lead.name)}
        </Avatar>
        <div className="lead-card-header-content">
          <Text className="lead-card-name">{lead.name}</Text>

          {/* Venture/Ad Name */}
          <div className="lead-card-venture-row">
            <HomeOutlined className="venture-icon" />
            <Text className="lead-card-venture" ellipsis>
              {lead.adName || lead.venture || "No campaign"}
            </Text>
          </div>
        </div>
      </div>

      {/* Created Date Badge */}
      {lead.createdAt && (
        <div className="lead-card-date-badge">
          <ClockCircleOutlined className="date-icon" />
          <Text className="date-text">{formatDate(lead.createdAt)}</Text>
        </div>
      )}

      {/* Contact Info */}
      <div className="lead-card-contacts">
        {lead.phone && (
          <div className="lead-card-contact-item">
            <PhoneOutlined className="contact-icon" />
            <Text className="contact-text">{lead.phone}</Text>
          </div>
        )}
        {lead.email && (
          <div className="lead-card-contact-item">
            <MailOutlined className="contact-icon" />
            <Text className="contact-text" ellipsis title={lead.email}>
              {lead.email}
            </Text>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="lead-card-footer">
        <div className="lead-card-assigned">
          <UserOutlined className="footer-icon" />
          <Text className="footer-text">
            {lead.assignedTo?.name || "Unassigned"}
          </Text>
        </div>
        {lead.source && (
          <div className="lead-card-source">
            <TagOutlined style={{ fontSize: 11 }} />
            <Text className="source-text">{lead.source}</Text>
          </div>
        )}
      </div>
    </Card>
  );
};
