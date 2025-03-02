/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';

import {
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  OutlinedInput,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from '@material-ui/core';

import ClearIcon from '@material-ui/icons/Clear';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';

import connectComponent from '../../../helpers/connect-component';
import getKeytarVaultName from '../../../helpers/get-keytar-vault-name';
import {
  getAllCredentialsAsync,
  deleteCredentialAsync,
  saveCredentialAsync,
} from '../../../invokers';
import {
  requestSetPreference,
} from '../../../senders';

const SectionAutofill = ({ passwordsAskToSave }) => {
  const [credentials, setCredentials] = useState([]);
  const [revealPasswords, setRevealPasswords] = useState({});

  const reloadCredentials = useCallback(() => {
    getAllCredentialsAsync()
      .then((_credentials) => {
        setCredentials(_credentials);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.log(err);
      });
  }, [setCredentials]);

  useEffect(() => {
    reloadCredentials();
  }, [reloadCredentials]);

  useEffect(() => {
    window.ipcRenderer.removeAllListeners('password-credentials-added');
    window.ipcRenderer.on('password-credentials-added', () => {
      reloadCredentials();
    });
    return () => {
      window.ipcRenderer.removeAllListeners('password-credentials-added');
    };
  }, [reloadCredentials]);

  return (
    <List disablePadding dense>
      <ListItem>
        <ListItemText
          primary="Ask to save logins and passwords for websites"
          secondary={`Passwords are stored locally and securely by ${getKeytarVaultName()}.`}
        />
        <ListItemSecondaryAction>
          <Switch
            edge="end"
            color="primary"
            checked={passwordsAskToSave}
            onChange={(e) => {
              requestSetPreference('passwordsAskToSave', e.target.checked);
            }}
          />
        </ListItemSecondaryAction>
      </ListItem>
      <Divider />
      {credentials.length < 1 ? (
        <ListItem disabled>
          <ListItemText primary="Saved passwords will appear here." />
        </ListItem>
      ) : (
        <>
          <ListItem>
            <Table aria-label="simple table">
              <TableHead>
                <TableRow>
                  <TableCell>Website</TableCell>
                  <TableCell align="right">Username</TableCell>
                  <TableCell align="right">Password</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {credentials.map((row) => {
                  const key = `${row.domain}-${row.username}`;
                  return (
                    <TableRow key={key}>
                      <TableCell component="th" scope="row">
                        {row.domain}
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          value={row.username}
                          margin="dense"
                          fullWidth
                          variant="outlined"
                          inputProps={{ 'aria-label': 'Username' }}
                          disabled
                        />
                      </TableCell>
                      <TableCell align="right">
                        <FormControl variant="outlined">
                          <OutlinedInput
                            id="outlined-adornment-password"
                            type={revealPasswords[key] ? 'text' : 'password'}
                            defaultValue={row.password}
                            margin="dense"
                            endAdornment={(
                              <InputAdornment position="end">
                                <IconButton
                                  aria-label="toggle password visibility"
                                  onClick={() => {
                                    setRevealPasswords({
                                      ...revealPasswords,
                                      [key]: !revealPasswords[key],
                                    });
                                  }}
                                  edge="end"
                                >
                                  {revealPasswords[key]
                                    ? <VisibilityIcon /> : <VisibilityOffIcon />}
                                </IconButton>
                              </InputAdornment>
                            )}
                            inputProps={{ 'aria-label': 'Password' }}
                            fullWidth
                            onChange={(e) => {
                              const newPassword = e.target.value;
                              saveCredentialAsync(row.domain, row.username, newPassword)
                                .then(() => reloadCredentials())
                                .catch((err) => {
                                  // eslint-disable-next-line no-console
                                  console.log(err);
                                });
                            }}
                          />
                        </FormControl>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Remove">
                          <IconButton
                            aria-label="Remove"
                            size="small"
                            onClick={() => {
                              deleteCredentialAsync(row.domain, row.username)
                                .then(() => reloadCredentials())
                                .catch((err) => {
                                  // eslint-disable-next-line no-console
                                  console.log(err);
                                });
                            }}
                          >
                            <ClearIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ListItem>
          <ListItem disabled>
            <ListItemText primary={`Passwords are stored locally and securely by ${getKeytarVaultName()}.`} />
          </ListItem>
        </>
      )}
    </List>
  );
};

SectionAutofill.propTypes = {
  passwordsAskToSave: PropTypes.bool.isRequired,
};

const mapStateToProps = (state) => ({
  passwordsAskToSave: state.preferences.passwordsAskToSave,
});

export default connectComponent(
  SectionAutofill,
  mapStateToProps,
);
