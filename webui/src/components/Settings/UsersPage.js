// src/components/Settings/UsersPage.js
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
  const isSuperAdmin = hasRole('super_admin');

  useEffect(() => {
    if (!isAdmin) {
      toast.error("You don't have permission to view this page");
      navigate('/dashboard');
      return;
    }
    
    fetchUsers();
  }, [isAdmin]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const response = await authService.getUsers();
      setUsers(response.data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      // Only show toast once
      if (!toast.isActive('users-error')) {
        toast.error('Failed to load users', { toastId: 'users-error' });
      }
      // Set an empty array to prevent undefined errors
      setUsers([]);
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
      toast.error('Failed to update user role');
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
                    <td>{new Date(user.created_at).toLocaleString()}</td>
                    <td>{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                    <td>
                      {user.username !== currentUser.username && (
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => handleEditUser(user)}
                          disabled={!isSuperAdmin && user.role === 'admin'}
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