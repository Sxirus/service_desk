import React from "react";
import { DataTable } from "./data-table";
import { createColumns, type User } from "./columns";
import { UsersTableSkeleton } from "@/components/UserManagementSkeletons";
import { useTranslation } from "react-i18next";

interface Role {
  id: number;
  name: string;
}

interface ClientUsersTableProps {
  data: User[];
  roles: Role[];
  isLoading?: boolean;
}

export default function ClientUsersTable({ data, roles, isLoading = false }: ClientUsersTableProps) {
  const { t } = useTranslation('manage');

  if (isLoading) {
    return <UsersTableSkeleton rows={5} />;
  }
  
  const columns = createColumns(roles, t);
  
  return <DataTable columns={columns} data={data} />;
}