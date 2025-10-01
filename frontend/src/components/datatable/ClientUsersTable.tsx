import React from "react";
import { DataTable } from "./data-table";
import { createColumns, type User } from "./columns";

interface Role {
  id: number;
  name: string;
}

interface ClientUsersTableProps {
  data: User[];
  roles: Role[];
}

export default function ClientUsersTable({ data, roles }: ClientUsersTableProps) {
  const columns = createColumns(roles);
  
  return <DataTable columns={columns} data={data} />;
}