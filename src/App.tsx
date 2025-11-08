import React, { useState, useEffect } from "react";
import { Layout, Menu, Button, theme, message, Modal } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  FileAddOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { KanbanBoard } from "./components/KanbanBoard";
import { LoginForm } from "./components/LoginForm";
import { LeadDetailsModal } from "./components/LeadDetailsModal";
import { CSVImport } from "./components/CSVImport";
import { fetchLeads } from "./services/api";
import { Lead, User } from "./types";

const { Header, Sider, Content } = Layout;

export const App: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [salesTeamMembers] = useState<User[]>([]); // In a real app, fetch this from API

  const { token } = theme.useToken();

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }

    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
      if (window.innerWidth <= 768) {
        setCollapsed(true);
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleLogin = () => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    setUser(null);
  };

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
  };

  const handleLeadUpdate = () => {
    message.success("Lead updated successfully");
    // Refresh the board
    fetchLeads();
  };

  if (!user) {
    return <LoginForm onLoginSuccess={handleLogin} />;
  }

  const menuItems = [
    {
      key: "user",
      icon: <UserOutlined />,
      label: user.name,
    },
    ...(user.role === "Admin"
      ? [
          {
            key: "import",
            icon: <FileAddOutlined />,
            label: "Import Leads",
            onClick: () => setShowCSVImport(true),
          },
        ]
      : []),
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Logout",
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        breakpoint="lg"
        collapsedWidth={isMobile ? 0 : 80}
        onBreakpoint={(broken) => {
          setCollapsed(broken);
        }}
        style={{
          overflow: "auto",
          height: "100vh",
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div style={{ padding: "16px", textAlign: "center" }}>
          <h1 style={{ color: "#fff", fontSize: collapsed ? "14px" : "18px" }}>
            Lead Manager
          </h1>
        </div>
        <Menu theme="dark" mode="inline" items={menuItems} />
      </Sider>
      <Layout style={{ marginLeft: collapsed ? (isMobile ? 0 : 80) : 200 }}>
        <Header style={{ padding: 0, background: token.colorBgContainer }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: "16px",
              width: 64,
              height: 64,
            }}
          />
        </Header>
        <Content
          style={{
            margin: "24px 16px",
            padding: 24,
            background: token.colorBgContainer,
            borderRadius: token.borderRadius,
            minHeight: 280,
          }}
        >
          <KanbanBoard
            onLeadClick={handleLeadClick}
            userRole={user.role}
            userId={user.id}
          />
        </Content>
      </Layout>

      {selectedLead && (
        <LeadDetailsModal
          lead={selectedLead}
          isOpen={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          onLeadUpdate={handleLeadUpdate}
          userRole={user.role}
          currentUser={user}
          salesTeamMembers={salesTeamMembers}
        />
      )}

      {showCSVImport && user.role === "Admin" && (
        <Modal
          title="Import Leads"
          open={showCSVImport}
          onCancel={() => setShowCSVImport(false)}
          footer={null}
        >
          <CSVImport
            onImportComplete={() => {
              setShowCSVImport(false);
              fetchLeads();
            }}
          />
        </Modal>
      )}
    </Layout>
  );
};
