// webui/src/components/Settings/UsersPage.js
import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Spinner, Badge } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faUsers, 
  faUserPlus, 
  faEdit, 
  faSave, 
  faTimes 
} from '@fortawesome/free-solid-svg-icons';
import authService from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import PageHeader from '../Layout/PageHeader';

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    role: 'user'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { currentUser, hasRole } = useAuth();
  const navigate = useNavigate();
  
  // Check if user is admin or super admin
  const isAdmin = hasRole('admin');

  useEffect(() => {
    // Only fetch users if we're authenticated
    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);
  
  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      console.log('Current user role:', currentUser?.role);
      console.log('Has admin role:', hasRole('admin'));
      
      const response = await authService.getUsers();
      if (response.data && response.data.users) {
        setUsers(response.data.users);
      } else {
        // Handle unexpected response format
        console.warn("Unexpected users response format:", response.data);
        setUsers([]);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      
      // Set empty array to prevent undefined errors
      setUsers([]);
      
      // Check if it's a permission error
      if (error.response && error.response.status === 403) {
        toast.error("You don't have permission to view users");
      } else {
        toast.error('Failed to load users: ' + (error.message || 'Unknown error'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddUser = () => {
    setFormData({
      username: '',
      password: '',
      email: '',
      role: 'user'
    });
    setShowAddModal(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setFormData({
      role: user.role
    });
    setShowEditModal(true);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await authService.registerUser(formData);
      toast.success(`User ${formData.username} created successfully`);
      setShowAddModal(false);
      fetchUsers();
    } catch (error) {
      console.error('Error creating user:', error);
      
      if (error.response && error.response.status === 409) {
        toast.error('Username or email already exists');
      } else if (error.response && error.response.status === 403) {
        toast.error('You do not have permission to create users');
      } else {
        toast.error('Failed to create user');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await authService.updateUserRole(selectedUser.id, formData.role);
      toast.success(`User role updated successfully`);
      setShowEditModal(false);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user role:', error);
      
      if (error.response && error.response.status === 403) {
        toast.error('You do not have permission to update this user');
      } else {
        toast.error('Failed to update user role');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadge = (role) => {
    switch(role) {
      case 'super_admin':
        return <Badge bg="danger">Super Admin</Badge>;
      case 'admin':
        return <Badge bg="warning">Admin</Badge>;
      default:
        return <Badge bg="info">User</Badge>;
    }
  };

  // Determine if current user can edit another user based on roles
  const canEditUser = (user) => {
    // User can't edit themselves
    if (user.username === currentUser.username) return false;
    
    // Super admins can edit anyone
    if (hasRole('super_admin')) return true;
    
    // Regular admins can't edit other admins or super admins
    if (hasRole('admin') && !hasRole('super_admin')) {
      return user.role !== 'admin' && user.role !== 'super_admin';
    }
    
    // Regular users can't edit anyone
    return false;
  };

  if (isLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading users...</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader 
        title="User Management" 
        subtitle="Manage user accounts and permissions"
        buttonText="Add User"
        buttonIcon={<FontAwesomeIcon icon={faUserPlus} className="me-1" />}
        buttonVariant="primary"
        onButtonClick={handleAddUser}
      />

      <Card>
        <Card.Header>
          <div className="d-flex align-items-center">
            <FontAwesomeIcon icon={faUsers} className="me-2" />
            <h5 className="mb-0">Users</h5>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          <Table responsive hover className="mb-0">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-3">No users found</td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.email || '-'}</td>
                    <td>{getRoleBadge(user.role)}</td>
                    <td>{user.created_at ? new Date(user.created_at).toLocaleString() : '-'}</td>
                    <td>{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                    <td>
                      {canEditUser(user) && (
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => handleEditUser(user)}
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      {/* Add User Modal */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)}>
        <Form onSubmit={handleAddSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>Add New User</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Role</Form.Label>
              <Form.Select
                name="role"
                value={formData.role}
                onChange={handleInputChange}
              >
                <option value="user">User</option>
                {hasRole('super_admin') && (
                  <>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </>
                )}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              <FontAwesomeIcon icon={faTimes} className="me-1" />
              Cancel
            </Button>
            <Button 
              variant="primary" 
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" animation="border" className="me-1" />
                  Creating...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSave} className="me-1" />
                  Create User
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Edit User Modal */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Form onSubmit={handleEditSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>Edit User: {selectedUser?.username}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Role</Form.Label>
              <Form.Select
                name="role"
                value={formData.role}
                onChange={handleInputChange}
              >
                <option value="user">User</option>
                {hasRole('super_admin') && (
                  <>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </>
                )}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowEditModal(false)}>
              <FontAwesomeIcon icon={faTimes} className="me-1" />
              Cancel
            </Button>
            <Button 
              variant="primary" 
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" animation="border" className="me-1" />
                  Updating...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSave} className="me-1" />
                  Update User
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
};

export default UsersPage;