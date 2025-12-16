{
  "project": "uczhehmbpiovnscpzgjx",
  "schema": "public",
  "tables": [
    {
      "schema": "public",
      "name": "client-emails",
      "rls_enabled": true,
      "rows": 0,
      "columns": [
        {
          "name": "id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "identity",
            "updatable"
          ],
          "identity_generation": "BY DEFAULT"
        },
        {
          "name": "provider_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "email_address",
          "data_type": "text",
          "format": "text",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "password",
          "data_type": "text",
          "format": "text",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "client_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "active",
          "data_type": "boolean",
          "format": "bool",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "created_by",
          "data_type": "uuid",
          "format": "uuid",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "imap",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "imap_port",
          "data_type": "integer",
          "format": "int4",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "smtp",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "smtp_port",
          "data_type": "integer",
          "format": "int4",
          "options": [
            "nullable",
            "updatable"
          ]
        }
      ],
      "primary_keys": [
        "id"
      ],
      "comment": "client email adress",
      "foreign_key_constraints": [
        {
          "name": "Client-Email_provider_id_fkey",
          "source": "public.client-emails.provider_id",
          "target": "public.email-provider.id"
        },
        {
          "name": "client-emails_created_by_fkey",
          "source": "public.client-emails.created_by",
          "target": "auth.users.id"
        },
        {
          "name": "Client-Email_client_id_fkey",
          "source": "public.client-emails.client_id",
          "target": "public.clients.id"
        }
      ]
    },
    {
      "schema": "public",
      "name": "clients",
      "rls_enabled": true,
      "rows": 1,
      "columns": [
        {
          "name": "id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "identity",
            "updatable",
            "unique"
          ],
          "identity_generation": "BY DEFAULT"
        },
        {
          "name": "name",
          "data_type": "text",
          "format": "text",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "address_street",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "address_city",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "address_zip",
          "data_type": "integer",
          "format": "int4",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "address_country",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "vat",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "website",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "isActive",
          "data_type": "boolean",
          "format": "bool",
          "options": [
            "updatable"
          ],
          "default_value": "true"
        },
        {
          "name": "shopify_store_url",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "shopify_access_token",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "shopify_connected",
          "data_type": "boolean",
          "format": "bool",
          "options": [
            "nullable",
            "updatable"
          ],
          "default_value": "false"
        },
        {
          "name": "shopify_scope",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "email_signature",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ],
          "comment": "the automatic email signature"
        }
      ],
      "primary_keys": [
        "id"
      ],
      "comment": "Table of business clients that use the use the service desk.",
      "foreign_key_constraints": [
        {
          "name": "Client-Email_client_id_fkey",
          "source": "public.client-emails.client_id",
          "target": "public.clients.id"
        },
        {
          "name": "incoming-mails_client_id_fkey",
          "source": "public.incoming-mails.client_id",
          "target": "public.clients.id"
        },
        {
          "name": "macros_client_id_fkey",
          "source": "public.macros.client_id",
          "target": "public.clients.id"
        },
        {
          "name": "ai_responses_client_id_fkey",
          "source": "public.ai_responses.client_id",
          "target": "public.clients.id"
        },
        {
          "name": "client_policies_client_id_fkey",
          "source": "public.client_policies.client_id",
          "target": "public.clients.id"
        },
        {
          "name": "Employee_client_id_fkey",
          "source": "public.employees.client_id",
          "target": "public.clients.id"
        },
        {
          "name": "Customer_client_id_fkey",
          "source": "public.customers.client_id",
          "target": "public.clients.id"
        }
      ]
    },
    {
      "schema": "public",
      "name": "customers",
      "rls_enabled": true,
      "rows": 23,
      "columns": [
        {
          "name": "id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "identity",
            "updatable"
          ],
          "identity_generation": "BY DEFAULT"
        },
        {
          "name": "client_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "employee_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "assg.Role_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "name",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        }
      ],
      "primary_keys": [
        "id"
      ],
      "comment": "Table of the customers",
      "foreign_key_constraints": [
        {
          "name": "send-mail_customer_id_fkey",
          "source": "public.sent-mail.customer_id",
          "target": "public.customers.id"
        },
        {
          "name": "Mail_customer_id_fkey",
          "source": "public.incoming-mails.customer_id",
          "target": "public.customers.id"
        },
        {
          "name": "Customer_assg.Role_id_fkey",
          "source": "public.customers.assg.Role_id",
          "target": "public.roles.id"
        },
        {
          "name": "Customer_employee_id_fkey",
          "source": "public.customers.employee_id",
          "target": "public.employees.id"
        },
        {
          "name": "email-adress_customer_id_fkey",
          "source": "public.email-addresses.customer_id",
          "target": "public.customers.id"
        },
        {
          "name": "Customer_client_id_fkey",
          "source": "public.customers.client_id",
          "target": "public.clients.id"
        }
      ]
    },
    {
      "schema": "public",
      "name": "email-addresses",
      "rls_enabled": true,
      "rows": 23,
      "columns": [
        {
          "name": "customer_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "email_address",
          "data_type": "text",
          "format": "text",
          "options": [
            "updatable",
            "unique"
          ]
        }
      ],
      "primary_keys": [
        "email_address"
      ],
      "comment": "Client email addresses",
      "foreign_key_constraints": [
        {
          "name": "incoming-mails_email_address_fkey",
          "source": "public.incoming-mails.email_address",
          "target": "public.email-addresses.email_address"
        },
        {
          "name": "email-adress_customer_id_fkey",
          "source": "public.email-addresses.customer_id",
          "target": "public.customers.id"
        }
      ]
    },
    {
      "schema": "public",
      "name": "email-provider",
      "rls_enabled": true,
      "rows": 1,
      "columns": [
        {
          "name": "id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "identity",
            "updatable",
            "unique"
          ],
          "identity_generation": "BY DEFAULT"
        },
        {
          "name": "name",
          "data_type": "text",
          "format": "text",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "settings",
          "data_type": "jsonb",
          "format": "jsonb",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "is_enabled",
          "data_type": "boolean",
          "format": "bool",
          "options": [
            "updatable"
          ],
          "default_value": "true"
        }
      ],
      "primary_keys": [
        "id"
      ],
      "comment": "Available email providers and their configuration",
      "foreign_key_constraints": []
    },
    {
      "schema": "public",
      "name": "employees",
      "rls_enabled": true,
      "rows": 3,
      "columns": [
        {
          "name": "id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "identity",
            "updatable"
          ],
          "identity_generation": "BY DEFAULT"
        },
        {
          "name": "client_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "name",
          "data_type": "text",
          "format": "text",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "user_id",
          "data_type": "uuid",
          "format": "uuid",
          "options": [
            "nullable",
            "updatable",
            "unique"
          ]
        }
      ],
      "primary_keys": [
        "id"
      ],
      "comment": "Table of employees",
      "foreign_key_constraints": [
        {
          "name": "Employee_client_id_fkey",
          "source": "public.employees.client_id",
          "target": "public.clients.id"
        },
        {
          "name": "Role-Employee_employee_id_fkey",
          "source": "public.roles-employees.employee_id",
          "target": "public.employees.id"
        },
        {
          "name": "Customer_employee_id_fkey",
          "source": "public.customers.employee_id",
          "target": "public.employees.id"
        },
        {
          "name": "send-mail_employee_id_fkey",
          "source": "public.sent-mail.employee_id",
          "target": "public.employees.id"
        },
        {
          "name": "employees_user_id_fkey",
          "source": "public.employees.user_id",
          "target": "auth.users.id"
        }
      ]
    },
    {
      "schema": "public",
      "name": "incoming-mails",
      "rls_enabled": true,
      "rows": 104,
      "columns": [
        {
          "name": "id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "identity",
            "updatable"
          ],
          "identity_generation": "BY DEFAULT"
        },
        {
          "name": "send_at",
          "data_type": "timestamp with time zone",
          "format": "timestamptz",
          "options": [
            "updatable"
          ],
          "default_value": "now()"
        },
        {
          "name": "customer_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "subject",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "text_content",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "email_address",
          "data_type": "text",
          "format": "text",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "html_content",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "client_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "read",
          "data_type": "boolean",
          "format": "bool",
          "options": [
            "nullable",
            "updatable"
          ],
          "default_value": "false"
        }
      ],
      "primary_keys": [
        "id"
      ],
      "comment": "Table of all the mails send from customers",
      "foreign_key_constraints": [
        {
          "name": "Mail_customer_id_fkey",
          "source": "public.incoming-mails.customer_id",
          "target": "public.customers.id"
        },
        {
          "name": "ai_responses_email_id_fkey",
          "source": "public.ai_responses.email_id",
          "target": "public.incoming-mails.id"
        },
        {
          "name": "incoming-mails_client_id_fkey",
          "source": "public.incoming-mails.client_id",
          "target": "public.clients.id"
        },
        {
          "name": "incoming-mails_email_address_fkey",
          "source": "public.incoming-mails.email_address",
          "target": "public.email-addresses.email_address"
        }
      ]
    },
    {
      "schema": "public",
      "name": "macros",
      "rls_enabled": true,
      "rows": 2,
      "columns": [
        {
          "name": "id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "identity",
            "updatable",
            "unique"
          ],
          "identity_generation": "BY DEFAULT"
        },
        {
          "name": "client_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "title",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "text",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        }
      ],
      "primary_keys": [
        "id"
      ],
      "comment": "all the macros connected to a client",
      "foreign_key_constraints": [
        {
          "name": "macros_client_id_fkey",
          "source": "public.macros.client_id",
          "target": "public.clients.id"
        }
      ]
    },
    {
      "schema": "public",
      "name": "roles-employees",
      "rls_enabled": true,
      "rows": 4,
      "columns": [
        {
          "name": "id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "identity",
            "updatable"
          ],
          "identity_generation": "BY DEFAULT"
        },
        {
          "name": "employee_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "role_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        }
      ],
      "primary_keys": [
        "id"
      ],
      "comment": "Links Role and Employee",
      "foreign_key_constraints": [
        {
          "name": "Role-Employee_employee_id_fkey",
          "source": "public.roles-employees.employee_id",
          "target": "public.employees.id"
        },
        {
          "name": "Role-Employee_role_id_fkey",
          "source": "public.roles-employees.role_id",
          "target": "public.roles.id"
        }
      ]
    },
    {
      "schema": "public",
      "name": "roles",
      "rls_enabled": true,
      "columns": [
        {
          "name": "id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "identity",
            "updatable"
          ],
          "identity_generation": "BY DEFAULT"
        },
        {
          "name": "name",
          "data_type": "text",
          "format": "text",
          "options": [
            "updatable"
          ]
        }
      ],
      "primary_keys": [
        "id"
      ],
      "comment": "Different roles a employee can have. They come with different permissions.",
      "foreign_key_constraints": [
        {
          "name": "Role-Employee_role_id_fkey",
          "source": "public.roles-employees.role_id",
          "target": "public.roles.id"
        },
        {
          "name": "Customer_assg.Role_id_fkey",
          "source": "public.customers.assg.Role_id",
          "target": "public.roles.id"
        }
      ]
    },
    {
      "schema": "public",
      "name": "sent-mail",
      "rls_enabled": true,
      "columns": [
        {
          "name": "id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "identity",
            "updatable"
          ],
          "identity_generation": "BY DEFAULT"
        },
        {
          "name": "send_at",
          "data_type": "timestamp with time zone",
          "format": "timestamptz",
          "options": [
            "updatable"
          ],
          "default_value": "now()"
        },
        {
          "name": "employee_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        },
        {
          "name": "text_content",
          "data_type": "text",
          "format": "text",
          "options": [
            "nullable",
            "updatable"
          ]
        },
        {
          "name": "customer_id",
          "data_type": "bigint",
          "format": "int8",
          "options": [
            "updatable"
          ]
        }
      ],
      "primary_keys": [
        "id"
      ],
      "comment": "Table of all the emails send from employees",
      "foreign_key_constraints": [
        {
          "name": "send-mail_employee_id_fkey",
          "source": "public.sent-mail.employee_id",
          "target": "public.employees.id"
        },
        {
          "name": "send-mail_customer_id_fkey",
          "source": "public.sent-mail.customer_id",
          "target": "public.customers.id"
        }
      ]
    }
  ]
}