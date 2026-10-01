              </thead>

              <tbody className="text-sm text-slate-700">
                {groupedRecords.length > 0 ? (
                  groupedRecords.flatMap((group, groupIndex) =>
                    group.records.map((record, recordIndex) => {
                      const jam = getJam(record);
                      const isFirstRecord = recordIndex === 0;
                      const identityNumber = group.nip || group.nik || group.id_user || '-';
                      const identityLabel = group.nip ? 'NIP' : group.nik ? 'NIK' : 'ID';

                      return (
                        <tr
                          key={`${group.id_user}-${record.date}-${recordIndex}`}
                          className="align-top transition-colors hover:bg-slate-50"
                        >
                          {isFirstRecord && (
                            <>
                              <td
                                rowSpan={group.records.length}
                                className="border border-slate-300 p-3 text-center align-top font-bold text-slate-700"
                              >
                                {groupIndex + 1}
                              </td>

                              <td
                                rowSpan={group.records.length}
                                className="border border-slate-300 p-4 align-top text-[12px] leading-6 text-slate-800"
                              >
                                <div>
                                  <span className="identity-label inline-block w-[72px] font-bold">Nama</span>
                                  <span className="mr-1">:</span>
                                  <span className="font-semibold">{group.name || '-'}</span>
                                </div>
                                <div>
                                  <span className="identity-label inline-block w-[72px] font-bold">{identityLabel}</span>
                                  <span className="mr-1">:</span>
                                  <span>{identityNumber}</span>
                                </div>
                                <div>
                                  <span className="identity-label inline-block w-[72px] font-bold">Status</span>
                                  <span className="mr-1">:</span>
                                  <span>{group.status_kepegawaian || '-'}</span>
                                </div>
                                <div>
                                  <span className="identity-label inline-block w-[72px] font-bold">Gol.Ruang</span>
                                  <span className="mr-1">:</span>
                                  <span>{group.golongan_ruang || '-'}</span>
                                </div>
                                <div>
                                  <span className="identity-label inline-block w-[72px] font-bold">Jabatan</span>
                                  <span className="mr-1">:</span>
                                  <span>{group.jabatan || '-'}</span>
                                </div>
                              </td>
                            </>
                          )}

                          <td className="border border-slate-300 p-3 text-center align-middle font-mono text-xs font-semibold">
                            {formatDateIndonesia(record.date)}
                          </td>

                          <td className="border border-slate-300 p-3 text-center align-middle font-mono text-xs font-bold">
                            <span className="text-emerald-700">{jam.masuk}</span>
                            <span className="mx-1 text-slate-400">-</span>
                            <span className="text-orange-700">{jam.pulang}</span>
                          </td>

                          <td className="border border-slate-300 p-3 text-center align-middle text-[11px] font-black">
                            {record.status || '-'}
                          </td>

                          <td className="border border-slate-300 p-3 text-center align-middle text-xs">
                            {record.keterangan || '-'}
                          </td>

                          <td className="border border-slate-300 p-2 text-center align-middle">
                            <AttendancePhoto
                              fileId={record.foto_masuk_file_id}
                              alt={`Foto masuk ${record.name} ${record.date}`}
                            />
                          </td>

                          <td className="border border-slate-300 p-2 text-center align-middle">
                            <AttendancePhoto
                              fileId={record.foto_pulang_file_id}
                              alt={`Foto pulang ${record.name} ${record.date}`}
                            />
                          </td>

                          <td className="screen-only border border-slate-300 p-2 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => handleDeleteAttendance(record)}
                              disabled={
                                deletingKey === `${record.id_user}-${record.date}` ||
                                Boolean(deletingKey)
                              }
                              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-black text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              title="Hapus data absensi"
                            >
                              <Trash2 className="h-4 w-4" />
                              Hapus
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )
                ) : (
                  <tr>
                    <td colSpan={9} className="p-14 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <FileText className="h-10 w-10 text-slate-300" />
                        <span className="font-medium italic">
                          Tidak ada data absensi pada bulan dan tahun yang dipilih.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
          </main>
        </div>
      </div>
